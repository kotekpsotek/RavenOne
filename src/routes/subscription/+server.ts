import { DB_Models } from "@ravenlens/backend";
import type { SubscriptionKinds } from "@ravenlens/shared";
import { json } from "@sveltejs/kit";
import { getRequiredEnv } from "$lib/server/env";
import { getStripeClient } from "$lib/server/stripe";
import type { RequestHandler } from "./$types";
import {
	ACTIVE_SUBSCRIPTION_STATUSES,
	PLAN_PRICE_ENV_KEY_BY_ID,
	getAuthenticatedUser,
	getStripeCustomerId,
	getSubscriptionSummary,
	normalizeSubscriptionKind,
	resolveSubscriptionKind,
	toErrorMessage,
	upsertSubscriptionFromUser,
	updateSubscriptionByCustomerId,
	type LegacySubscriptionKind,
	type UserProfileRecord
} from "./common";
import type { SubscriptionResponse } from "./universal.types";

type CheckoutPlanId = SubscriptionKinds;

type CheckoutIntentBody = {
	action?: string;
	planId?: CheckoutPlanId;
	subscriptionKind?: SubscriptionKinds;
	// Legacy field kept for compatibility with older clients.
	kind?: LegacySubscriptionKind;
	successPath?: string;
	cancelPath?: string;
};

function normalizePlanId(value: unknown): CheckoutPlanId | null {
	return normalizeSubscriptionKind(value);
}

function normalizeLocalPath(value: unknown, fallbackPath: string): string {
	if (typeof value !== "string") {
		return fallbackPath;
	}

	const trimmed = value.trim();
	if (!trimmed.startsWith("/")) {
		return fallbackPath;
	}

	return trimmed;
}

function toAbsoluteLocalUrl(baseUrl: URL, path: string): string {
	const resolved = new URL(path, baseUrl.origin);
	if (resolved.origin !== baseUrl.origin) {
		throw new Error("Stripe redirect URLs must stay on the same origin");
	}

	return resolved.toString();
}

async function ensureStripeCustomerForUser(user: UserProfileRecord, subscriptionKind: SubscriptionKinds) {
	const existing = await DB_Models.Subscription.subscriptionCustomerModel.findOne({ userId: user.id });
	const stripe = getStripeClient();

	let stripeCustomerId: string | null =
		typeof existing?.stripeCustomerId === "string" && existing.stripeCustomerId.trim()
			? existing.stripeCustomerId
			: null;

	if (!stripeCustomerId) {
		const createdCustomer = await stripe.customers.create({
			email: user.email,
			metadata: {
				userId: user.id,
				subscriptionKind,
			}
		});

		stripeCustomerId = createdCustomer.id;
	}

	await upsertSubscriptionFromUser(
		user,
		{
			subscriptionKind,
			stripeCustomerId
		},
		{ upsert: true }
	);

	return stripeCustomerId;
}

async function handleCheckoutIntent(
	event: Parameters<RequestHandler>[0],
	requestBody: CheckoutIntentBody
) {
	const user = await getAuthenticatedUser(event.request, event.cookies);
	if (!user) {
		return json({ status: false, error: "Unauthorized" }, { status: 401 });
	}

	const planId = normalizePlanId(requestBody.planId);
	if (!planId) {
		return json({ status: false, error: "Unsupported subscription plan" }, { status: 400 });
	}

	const expectedSubscriptionKind = planId;
	const requestedSubscriptionKind = normalizeSubscriptionKind(requestBody.subscriptionKind);
	if (requestBody.subscriptionKind && requestedSubscriptionKind !== expectedSubscriptionKind) {
		return json({ status: false, error: "Plan kind mismatch" }, { status: 400 });
	}

	const priceId = getRequiredEnv(PLAN_PRICE_ENV_KEY_BY_ID[planId]);
	const stripe = getStripeClient();
	const stripeCustomerId = await ensureStripeCustomerForUser(user, expectedSubscriptionKind);

	const successUrl = toAbsoluteLocalUrl(
		event.url,
		normalizeLocalPath(requestBody.successPath, `/subscription?checkout=success&plan=${planId}`)
	);
	const cancelUrl = toAbsoluteLocalUrl(
		event.url,
		normalizeLocalPath(requestBody.cancelPath, `/subscription?checkout=cancel&plan=${planId}`)
	);

	const checkoutSession = await stripe.checkout.sessions.create({
		mode: "subscription",
		customer: stripeCustomerId,
		line_items: [{ price: priceId, quantity: 1 }],
		success_url: successUrl,
		cancel_url: cancelUrl,
		allow_promotion_codes: true,
		client_reference_id: user.id,
		metadata: {
			userId: user.id,
			subscriptionKind: expectedSubscriptionKind,
			planId
		}
	});

	return json(
		{
			status: true,
			url: checkoutSession.url,
			checkoutSessionId: checkoutSession.id
		},
		{ status: 200 }
	);
}

async function handleCancelIntent(event: Parameters<RequestHandler>[0]) {
	const user = await getAuthenticatedUser(event.request, event.cookies);
	if (!user) {
		return json({ status: false, error: "Unauthorized" }, { status: 401 });
	}

	const customer = (await DB_Models.Subscription.subscriptionCustomerModel.findOne({
		userId: user.id
	}));
	const stripeSubscriptionId =
		typeof customer?.stripeSubscriptionId === "string" ? customer.stripeSubscriptionId.trim() : "";

	if (!stripeSubscriptionId) {
		return json({ status: false, error: "No active subscription" }, { status: 400 });
	}

	// Update at stripe
	const stripe = getStripeClient();
	const updatedSubscription = await stripe.subscriptions.update(stripeSubscriptionId, {
		cancel_at_period_end: true
	});

	// Prepare the subscription
	const summary = getSubscriptionSummary(updatedSubscription);
	const stripeCustomerId =
		getStripeCustomerId(updatedSubscription.customer) ??
		(typeof customer?.stripeCustomerId === "string" ? customer.stripeCustomerId : undefined);
	const subscriptionKind = resolveSubscriptionKind({
		subscriptionKind: updatedSubscription.metadata?.subscriptionKind,
		planId: updatedSubscription.metadata?.planId,
		priceId: summary.priceId,
		fallback: resolveSubscriptionKind({
			subscriptionKind: customer?.subscriptionKind,
			priceId: customer?.priceId,
			fallback: "growth"
		})
	});

	// Update the subscription in database
	await upsertSubscriptionFromUser(
		user,
		{
			subscriptionKind,
			...(stripeCustomerId ? { stripeCustomerId } : {}),
			...summary
		},
		{ upsert: true }
	);

	if (stripeCustomerId) {
		await updateSubscriptionByCustomerId(
			stripeCustomerId,
			{
				subscriptionKind,
				...summary
			},
			{ upsert: false }
		);
	}

	return json(
		{
			status: true,
			message: "Subscription cancellation scheduled",
			subscription: {
				subscriptionKind,
				...summary,
				stripeCustomerId
			}
		},
		{ status: 200 }
	);
}

// Downloading the subscription and its status
export const GET: RequestHandler = async ({ request, cookies }) => {
	try {
		const user = await getAuthenticatedUser(request, cookies);
		if (!user) {
			return json({ status: false, error: "Unauthorized" }, { status: 401 });
		}

		const customer = (await DB_Models.Subscription.subscriptionCustomerModel.findOne({
			userId: user.id
		}));

		if (!customer) {
			return json(
				{
					status: true,
					subscribed: false,
					subscription: null
				},
				{ status: 200 }
			);
		}

		const subscriptionKind = resolveSubscriptionKind({
			subscriptionKind: customer.subscriptionKind,
			priceId: customer.priceId,
			fallback: "growth"
		});

		return json(
			{
				status: true,
				subscribed: customer.status
					? ACTIVE_SUBSCRIPTION_STATUSES.has(customer.status)
					: false,
				subscription: {
					createdAt: customer.createdAt,
					updatedAt: customer.updatedAt,
					userId: customer.userId,
					subscriptionKind,
					status: customer.status,
					stripeCustomerId: customer.stripeCustomerId,
					stripeSubscriptionId: customer.stripeSubscriptionId,
					priceId: customer.priceId,
					currentPeriodEnd: customer.currentPeriodEnd,
					cancelAtPeriodEnd: customer.cancelAtPeriodEnd
				}
			} satisfies SubscriptionResponse,
			{ status: 200 }
		);
	} catch (error) {
		return json(
			{
				status: false,
				error: toErrorMessage(error)
			} satisfies SubscriptionResponse,
			{ status: 500 }
		);
	}
};

// Starting / canceling checkout intent 
export const POST: RequestHandler = async (event) => {
	try {
		let requestBody: CheckoutIntentBody;
		try {
			requestBody = (await event.request.json()) as CheckoutIntentBody;
		} catch {
			return json({ status: false, error: "Invalid request body" }, { status: 400 });
		}

		if (requestBody.action === "checkout") {
			return handleCheckoutIntent(event, requestBody);
		}

		if (requestBody.action === "cancel") {
			return handleCancelIntent(event);
		}

		return json({ status: false, error: "Unsupported action" }, { status: 400 });
	} catch (error) {
		return json(
			{
				status: false,
				error: toErrorMessage(error)
			},
			{ status: 500 }
		);
	}
};