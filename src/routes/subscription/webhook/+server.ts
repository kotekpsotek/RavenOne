import { dev } from "$app/environment";
import { env } from "$env/dynamic/private";
import { DB_Models } from "@ravenlens/backend";
import type { SubscriptionKinds } from "@ravenlens/shared";
import { json } from "@sveltejs/kit";
import Stripe from "stripe";
import type { RequestHandler } from "./$types";

type LegacySubscriptionKind = "individual" | "company";

type UserProfileRecord = {
	_id: unknown;
	id: string;
	email?: string;
};

type SubscriptionSummary = {
	stripeSubscriptionId: string;
	status: Stripe.Subscription.Status;
	priceId?: string;
	currentPeriodEnd?: Date;
	cancelAtPeriodEnd?: boolean;
};

type SubscriptionCustomerPatch = {
	subscriptionKind?: SubscriptionKinds;
	stripeCustomerId?: string;
	stripeSubscriptionId?: string;
	status?: Stripe.Subscription.Status;
	priceId?: string;
	currentPeriodEnd?: Date;
	cancelAtPeriodEnd?: boolean;
};

const PLAN_PRICE_ENV_KEY_BY_ID: Record<SubscriptionKinds, string> = {
	starter: "STRIPE_STARTER_PRICE_ID",
	growth: "STRIPE_GROWTH_PRICE_ID",
	enterprise: "STRIPE_ENTERPRISE_PRICE_ID"
};

let stripeClient: Stripe | undefined;

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === "string") {
		return error;
	}

	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

function asNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length ? trimmed : undefined;
}

function getRequiredEnv(name: string): string {
	const value = (env as Record<string, string | undefined>)[name]?.trim();
	if (!value) {
		throw new Error(`${name} is not configured`);
	}

	return value;
}

function getStripeClient() {
	if (!stripeClient) {
		stripeClient = new Stripe(getRequiredEnv("STRIPE_SECRET_KEY"), {
			apiVersion: "2023-10-16",
			typescript: true
		});
	}

	return stripeClient;
}

function normalizeSubscriptionKind(value: unknown): SubscriptionKinds | null {
	if (value === "starter" || value === "growth" || value === "enterprise") {
		return value;
	}

	return null;
}

function normalizeLegacyKind(value: unknown): LegacySubscriptionKind | null {
	if (value === "individual" || value === "company") {
		return value;
	}

	return null;
}

function inferPlanIdFromPriceId(value: unknown): SubscriptionKinds | null {
	const priceId = asNonEmptyString(value);
	if (!priceId) {
		return null;
	}

	for (const [planId, envKey] of Object.entries(PLAN_PRICE_ENV_KEY_BY_ID) as [
		SubscriptionKinds,
		string
	][]) {
		const configuredPriceId = (env as Record<string, string | undefined>)[envKey]?.trim();
		if (configuredPriceId && configuredPriceId === priceId) {
			return planId;
		}
	}

	return null;
}

function resolveSubscriptionKind(options: {
	subscriptionKind?: unknown;
	planId?: unknown;
	legacyKind?: unknown;
	priceId?: unknown;
	fallback?: SubscriptionKinds;
}): SubscriptionKinds {
	const fromSubscriptionKind = normalizeSubscriptionKind(options.subscriptionKind);
	if (fromSubscriptionKind) {
		return fromSubscriptionKind;
	}

	const fromPlanId = normalizeSubscriptionKind(options.planId);
	if (fromPlanId) {
		return fromPlanId;
	}

	const fromPriceId = inferPlanIdFromPriceId(options.priceId);
	if (fromPriceId) {
		return fromPriceId;
	}

	const fromLegacyKind = normalizeLegacyKind(options.legacyKind);
	if (fromLegacyKind === "company") {
		return "enterprise";
	}

	return options.fallback ?? "growth";
}

function getStripeCustomerId(
	customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
): string | null {
	if (!customer) {
		return null;
	}

	if (typeof customer === "string") {
		return customer;
	}

	return customer.id ?? null;
}

function getStripeSubscriptionId(
	subscription: string | Stripe.Subscription | null | undefined
): string | null {
	if (!subscription) {
		return null;
	}

	if (typeof subscription === "string") {
		return subscription;
	}

	return subscription.id ?? null;
}

function getSubscriptionSummary(subscription: Stripe.Subscription): SubscriptionSummary {
	const item = subscription.items.data[0];

	return {
		stripeSubscriptionId: subscription.id,
		status: subscription.status,
		priceId: item?.price?.id,
		currentPeriodEnd: subscription.current_period_end
			? new Date(subscription.current_period_end * 1000)
			: undefined,
		cancelAtPeriodEnd: subscription.cancel_at_period_end
	};
}

async function findUserById(userId: string): Promise<UserProfileRecord | null> {
	const user = await DB_Models.UserAccount.profileModel.findOne({ id: userId });
	return (user as UserProfileRecord | null) ?? null;
}

async function upsertSubscriptionFromUser(user: UserProfileRecord, patch: SubscriptionCustomerPatch) {
	await DB_Models.Subscription.subscriptionCustomerModel.updateOne(
		{ userId: user.id },
		{
			$set: {
				userId: user.id,
				user: user._id,
				email: user.email,
				...patch
			}
		},
		{ upsert: true }
	);
}

async function updateSubscriptionByCustomerId(stripeCustomerId: string, patch: SubscriptionCustomerPatch) {
	await DB_Models.Subscription.subscriptionCustomerModel.updateOne(
		{ stripeCustomerId },
		{
			$set: {
				stripeCustomerId,
				...patch
			}
		},
		{ upsert: false }
	);
}

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
