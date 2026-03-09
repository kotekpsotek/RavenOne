import { env } from "$env/dynamic/private";
import { getAuthenticatedPayload } from "$lib/server/auth/request";
import { DB_Models } from "@ravenlens/backend";
import { json } from "@sveltejs/kit";
import type { SubscriptionKinds } from "@ravenlens/shared";
import type { RequestHandler } from "./$types";
import { getRequiredEnv } from "$lib/server/env";
import type Stripe from "stripe";
import { getStripeClient } from "$lib/server/stripe";

type LegacySubscriptionKind = "individual" | "company";
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

type UserProfileRecord = {
	_id: unknown;
	id: string;
	email?: string;
	name?: string;
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

type SubscriptionCustomerRecord = {
	userId?: string;
	email?: string;
	subscriptionKind?: unknown;
	kind?: unknown;
	status?: Stripe.Subscription.Status;
	stripeCustomerId?: string;
	stripeSubscriptionId?: string;
	priceId?: string;
	currentPeriodEnd?: Date;
	cancelAtPeriodEnd?: boolean;
};

type SubscriptionCustomerModelLike = {
	findOne(query: Record<string, unknown>): Promise<any>;
	updateOne(
		query: Record<string, unknown>,
		update: Record<string, unknown>,
		options?: Record<string, unknown>
	): Promise<{ matchedCount?: number } | any>;
	create(payload: Record<string, unknown>): Promise<any>;
};

const LEGACY_KIND_BY_PLAN_ID: Record<CheckoutPlanId, LegacySubscriptionKind> = {
	starter: "individual",
	growth: "individual",
	enterprise: "company"
};

const PLAN_PRICE_ENV_KEY_BY_ID: Record<CheckoutPlanId, string> = {
	starter: "STRIPE_STARTER_PRICE_ID",
	growth: "STRIPE_GROWTH_PRICE_ID",
	enterprise: "STRIPE_ENTERPRISE_PRICE_ID"
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing"]);

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

function getSubscriptionCustomerModel(): SubscriptionCustomerModelLike {
	const models = DB_Models as unknown as {
		Subscriptions?: { subscriptionCustomerModel?: SubscriptionCustomerModelLike };
		Subscription?: { subscriptionCustomerModel?: SubscriptionCustomerModelLike };
	};

	const model =
		models.Subscriptions?.subscriptionCustomerModel ?? models.Subscription?.subscriptionCustomerModel;

	if (!model) {
		throw new Error("DB_Models.Subscription.subscriptionCustomerModel is not available");
	}

	return model;
}

function normalizePlanId(value: unknown): CheckoutPlanId | null {
	if (value === "starter" || value === "growth" || value === "enterprise") {
		return value;
	}

	return null;
}

function normalizeSubscriptionKind(value: unknown): SubscriptionKinds | null {
	if (value === "starter" || value === "growth" || value === "enterprise") {
		return value;
	}

	return null;
}

function normalizeLegacySubscriptionKind(value: unknown): LegacySubscriptionKind | null {
	if (value === "individual" || value === "company") {
		return value;
	}

	return null;
}

function inferPlanIdFromPriceId(value: unknown): CheckoutPlanId | null {
	if (typeof value !== "string" || !value.trim()) {
		return null;
	}

	for (const [planId, envKey] of Object.entries(PLAN_PRICE_ENV_KEY_BY_ID) as [
		CheckoutPlanId,
		string
	][]) {
		const configuredPriceId = (env as Record<string, string | undefined>)[envKey]?.trim();
		if (configuredPriceId && configuredPriceId === value.trim()) {
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

	const fromPlanId = normalizePlanId(options.planId);
	if (fromPlanId) {
		return fromPlanId;
	}

	const fromPriceId = inferPlanIdFromPriceId(options.priceId);
	if (fromPriceId) {
		return fromPriceId;
	}

	const fromLegacyKind = normalizeLegacySubscriptionKind(options.legacyKind);
	if (fromLegacyKind === "company") {
		return "enterprise";
	}

	return options.fallback ?? "growth";
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

async function getAuthenticatedUser(request: Request, cookies: Parameters<RequestHandler>[0]["cookies"]) {
	const payload = getAuthenticatedPayload(request, cookies);
	if (!payload) {
		return null;
	}

	const query: { id: string; email?: string } = {
		id: payload.userId
	};

	if (payload.email) {
		query.email = payload.email;
	}

	const user = await DB_Models.UserAccount.profileModel.findOne(query);
	return (user as UserProfileRecord | null) ?? null;
}

async function upsertSubscriptionFromUser(
	user: UserProfileRecord,
	patch: SubscriptionCustomerPatch,
	options?: { upsert?: boolean }
) {
	const subscriptionCustomerModel = getSubscriptionCustomerModel();
	await subscriptionCustomerModel.updateOne(
		{ userId: user.id },
		{
			$set: {
				userId: user.id,
				user: user._id,
				email: user.email,
				...patch
			}
		},
		{ upsert: options?.upsert ?? true }
	);
}

async function updateSubscriptionByCustomerId(
	stripeCustomerId: string,
	patch: SubscriptionCustomerPatch,
	options?: { upsert?: boolean }
) {
	const subscriptionCustomerModel = getSubscriptionCustomerModel();
	await subscriptionCustomerModel.updateOne(
		{ stripeCustomerId },
		{
			$set: {
				stripeCustomerId,
				...patch
			}
		},
		{ upsert: options?.upsert ?? false }
	);
}

async function ensureStripeCustomerForUser(user: UserProfileRecord, subscriptionKind: SubscriptionKinds) {
	const subscriptionCustomerModel = getSubscriptionCustomerModel();
	const existing = await subscriptionCustomerModel.findOne({ userId: user.id });
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
				kind: LEGACY_KIND_BY_PLAN_ID[subscriptionKind]
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

function getSubscriptionSummary(subscription: Stripe.Subscription): SubscriptionSummary {
	const subscriptionItem = subscription.items.data[0];

	return {
		stripeSubscriptionId: subscription.id,
		status: subscription.status,
		priceId: subscriptionItem?.price?.id,
		currentPeriodEnd: subscription.current_period_end
			? new Date(subscription.current_period_end * 1000)
			: undefined,
		cancelAtPeriodEnd: subscription.cancel_at_period_end
	};
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

	const legacyKind = normalizeLegacySubscriptionKind(requestBody.kind);
	if (legacyKind && legacyKind !== LEGACY_KIND_BY_PLAN_ID[planId]) {
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
			kind: LEGACY_KIND_BY_PLAN_ID[expectedSubscriptionKind],
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

	const subscriptionCustomerModel = getSubscriptionCustomerModel();
	const customer = (await subscriptionCustomerModel.findOne({
		userId: user.id
	})) as SubscriptionCustomerRecord | null;
	const stripeSubscriptionId =
		typeof customer?.stripeSubscriptionId === "string" ? customer.stripeSubscriptionId.trim() : "";

	if (!stripeSubscriptionId) {
		return json({ status: false, error: "No active subscription" }, { status: 400 });
	}

	const stripe = getStripeClient();
	const updatedSubscription = await stripe.subscriptions.update(stripeSubscriptionId, {
		cancel_at_period_end: true
	});

	const summary = getSubscriptionSummary(updatedSubscription);
	const stripeCustomerId =
		getStripeCustomerId(updatedSubscription.customer) ??
		(typeof customer?.stripeCustomerId === "string" ? customer.stripeCustomerId : undefined);
	const subscriptionKind = resolveSubscriptionKind({
		subscriptionKind: updatedSubscription.metadata?.subscriptionKind,
		planId: updatedSubscription.metadata?.planId,
		legacyKind: updatedSubscription.metadata?.kind,
		priceId: summary.priceId,
		fallback: resolveSubscriptionKind({
			subscriptionKind: customer?.subscriptionKind,
			legacyKind: customer?.kind,
			priceId: customer?.priceId,
			fallback: "growth"
		})
	});

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

		const subscriptionCustomerModel = getSubscriptionCustomerModel();
		const customer = (await subscriptionCustomerModel.findOne({
			userId: user.id
		})) as SubscriptionCustomerRecord | null;

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
			legacyKind: customer.kind,
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
					userId: customer.userId,
					subscriptionKind,
					kind: subscriptionKind,
					status: customer.status,
					stripeCustomerId: customer.stripeCustomerId,
					stripeSubscriptionId: customer.stripeSubscriptionId,
					priceId: customer.priceId,
					currentPeriodEnd: customer.currentPeriodEnd,
					cancelAtPeriodEnd: customer.cancelAtPeriodEnd
				}
			},
			{ status: 200 }
		);
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