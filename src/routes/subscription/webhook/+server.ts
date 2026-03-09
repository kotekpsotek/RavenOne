import { dev } from "$app/environment";
import { getRequiredEnv } from "$lib/server/env";
import { getStripeClient } from "$lib/server/stripe";
import { json } from "@sveltejs/kit";
import type Stripe from "stripe";
import type { RequestHandler } from "./$types";
import {
	asNonEmptyString,
	findUserById,
	getStripeCustomerId,
	getStripeSubscriptionId,
	getSubscriptionSummary,
	resolveSubscriptionKind,
	toErrorMessage,
	upsertSubscriptionFromUser,
	updateSubscriptionByCustomerId
} from "../common";

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
	const stripeCustomerId = getStripeCustomerId(session.customer);
	if (!stripeCustomerId) {
		throw new Error("checkout.session.completed is missing customer id");
	}

	const stripeSubscriptionId = getStripeSubscriptionId(session.subscription);
	if (!stripeSubscriptionId) {
		throw new Error("checkout.session.completed is missing subscription id");
	}

	const stripeSubscription = await getStripeClient().subscriptions.retrieve(stripeSubscriptionId);
	const summary = getSubscriptionSummary(stripeSubscription);
	const subscriptionKind = resolveSubscriptionKind({
		subscriptionKind: stripeSubscription.metadata?.subscriptionKind ?? session.metadata?.subscriptionKind,
		planId: stripeSubscription.metadata?.planId ?? session.metadata?.planId,
		legacyKind: stripeSubscription.metadata?.kind ?? session.metadata?.kind,
		priceId: summary.priceId,
		fallback: "growth"
	});

	await updateSubscriptionByCustomerId(stripeCustomerId, {
		subscriptionKind,
		...summary
	});

	const userId =
		asNonEmptyString(session.metadata?.userId) ??
		asNonEmptyString(session.client_reference_id) ??
		asNonEmptyString(stripeSubscription.metadata?.userId);

	if (!userId) {
		return;
	}

	const user = await findUserById(userId);
	if (!user) {
		return;
	}

	await upsertSubscriptionFromUser(user, {
		subscriptionKind,
		stripeCustomerId,
		...summary
	});
}

async function handleCustomerSubscriptionChanged(subscription: Stripe.Subscription) {
	const stripeCustomerId = getStripeCustomerId(subscription.customer);
	if (!stripeCustomerId) {
		throw new Error("customer.subscription event is missing customer id");
	}

	const summary = getSubscriptionSummary(subscription);
	const subscriptionKind = resolveSubscriptionKind({
		subscriptionKind: subscription.metadata?.subscriptionKind,
		planId: subscription.metadata?.planId,
		legacyKind: subscription.metadata?.kind,
		priceId: summary.priceId,
		fallback: "growth"
	});

	await updateSubscriptionByCustomerId(stripeCustomerId, {
		subscriptionKind,
		...summary
	});

	const userId = asNonEmptyString(subscription.metadata?.userId);
	if (!userId) {
		return;
	}

	const user = await findUserById(userId);
	if (!user) {
		return;
	}

	await upsertSubscriptionFromUser(user, {
		subscriptionKind,
		stripeCustomerId,
		...summary
	});
}

async function handleInvoiceEvent(invoice: Stripe.Invoice) {
	const stripeCustomerId = getStripeCustomerId(invoice.customer);
	if (!stripeCustomerId) {
		throw new Error("invoice event is missing customer id");
	}

	const stripeSubscriptionId = getStripeSubscriptionId(invoice.subscription);
	if (!stripeSubscriptionId) {
		throw new Error("invoice event is missing subscription id");
	}

	const stripeSubscription = await getStripeClient().subscriptions.retrieve(stripeSubscriptionId);
	const summary = getSubscriptionSummary(stripeSubscription);
	const subscriptionKind = resolveSubscriptionKind({
		subscriptionKind: stripeSubscription.metadata?.subscriptionKind,
		planId: stripeSubscription.metadata?.planId,
		legacyKind: stripeSubscription.metadata?.kind,
		priceId: summary.priceId,
		fallback: "growth"
	});

	await updateSubscriptionByCustomerId(stripeCustomerId, {
		subscriptionKind,
		...summary
	});

	const userId = asNonEmptyString(stripeSubscription.metadata?.userId);
	if (!userId) {
		return;
	}

	const user = await findUserById(userId);
	if (!user) {
		return;
	}

	await upsertSubscriptionFromUser(user, {
		subscriptionKind,
		stripeCustomerId,
		...summary
	});
}

async function handleWebhookEvent(event: Stripe.Event) {
	switch (event.type) {
		case "checkout.session.completed":
			await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
			break;

		case "customer.subscription.created":
		case "customer.subscription.updated":
		case "customer.subscription.deleted":
			await handleCustomerSubscriptionChanged(event.data.object as Stripe.Subscription);
			break;

		case "invoice.payment_succeeded":
		case "invoice.payment_failed":
			await handleInvoiceEvent(event.data.object as Stripe.Invoice);
			break;

		default:
			break;
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const payload = await request.text();
	let event: Stripe.Event;

	if (dev) {
		try {
			event = JSON.parse(payload) as Stripe.Event;
		} catch (error) {
			return new Response(`Invalid webhook payload: ${toErrorMessage(error)}`, { status: 400 });
		}
	} else {
		const stripeSignature = request.headers.get("stripe-signature");
		if (!stripeSignature) {
			return new Response("Missing Stripe signature", { status: 400 });
		}

		try {
			event = getStripeClient().webhooks.constructEvent(
				payload,
				stripeSignature,
				getRequiredEnv("STRIPE_WEBHOOK_SECRET")
			);
		} catch (error) {
			return new Response(`Invalid Stripe signature: ${toErrorMessage(error)}`, { status: 400 });
		}
	}

	try {
		await handleWebhookEvent(event);
		return json({ received: true }, { status: 200 });
	} catch (error) {
		return new Response(`Webhook Processing Error: ${toErrorMessage(error)}`, { status: 400 });
	}
};
