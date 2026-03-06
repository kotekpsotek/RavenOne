import { env } from "$env/dynamic/private";
import { getAuthenticatedPayload } from "$lib/server/auth/request";
import { DB_Models } from "@ravenlens/backend";
import { json } from "@sveltejs/kit";
import Stripe from "stripe";
import type { RequestHandler } from "./$types";

type SubscriptionKind = "individual" | "company";
type CheckoutPlanId = "starter" | "growth" | "enterprise";

type CheckoutIntentBody = {
	action?: string;
	planId?: CheckoutPlanId;
	kind?: SubscriptionKind;
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

type SubscriptionCustomerModelLike = {
	findOne(query: Record<string, unknown>): Promise<any>;
	updateOne(
		query: Record<string, unknown>,
		update: Record<string, unknown>,
		options?: Record<string, unknown>
	): Promise<{ matchedCount?: number } | any>;
	create(payload: Record<string, unknown>): Promise<any>;
};

const PLAN_KIND_BY_ID: Record<CheckoutPlanId, SubscriptionKind> = {
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

function normalizeSubscriptionKind(value: unknown): SubscriptionKind | null {
	if (value === "individual" || value === "company") {
		return value;
	}

	return null;
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

async function findUserById(userId: string): Promise<UserProfileRecord | null> {
	const user = await DB_Models.UserAccount.profileModel.findOne({ id: userId });
	return (user as UserProfileRecord | null) ?? null;
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
	patch: Record<string, unknown>,
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
	patch: Record<string, unknown>,
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

async function ensureStripeCustomerForUser(user: UserProfileRecord, kind: SubscriptionKind) {
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
				kind
			}
		});

		stripeCustomerId = createdCustomer.id;
	}

	await upsertSubscriptionFromUser(
		user,
		{
			kind,
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

	const expectedKind = PLAN_KIND_BY_ID[planId];
	const requestedKind = normalizeSubscriptionKind(requestBody.kind) ?? expectedKind;
	if (requestedKind !== expectedKind) {
		return json({ status: false, error: "Plan kind mismatch" }, { status: 400 });
	}

	const priceId = getRequiredEnv(PLAN_PRICE_ENV_KEY_BY_ID[planId]);
	const stripe = getStripeClient();
	const stripeCustomerId = await ensureStripeCustomerForUser(user, expectedKind);

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
			kind: expectedKind,
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

async function handleWebhookEvent(stripeEvent: Stripe.Event) {
	const stripe = getStripeClient();

	switch (stripeEvent.type) {
		case "checkout.session.completed": {
			const session = stripeEvent.data.object as Stripe.Checkout.Session;
			const userId =
				typeof session.metadata?.userId === "string" && session.metadata.userId.trim()
					? session.metadata.userId
					: typeof session.client_reference_id === "string" && session.client_reference_id.trim()
						? session.client_reference_id
						: null;
			const stripeCustomerId = getStripeCustomerId(session.customer);
			const stripeSubscriptionId = getStripeSubscriptionId(session.subscription);
			const kind = normalizeSubscriptionKind(session.metadata?.kind) ?? "individual";

			if (userId) {
				const user = await findUserById(userId);
				if (user) {
					await upsertSubscriptionFromUser(user, {
						kind,
						stripeCustomerId,
						stripeSubscriptionId
					});
				}
			}

			if (stripeCustomerId && stripeSubscriptionId) {
				await updateSubscriptionByCustomerId(stripeCustomerId, {
					stripeSubscriptionId
				});
			}

			break;
		}

		case "customer.subscription.created":
		case "customer.subscription.updated":
		case "customer.subscription.deleted": {
			const subscription = stripeEvent.data.object as Stripe.Subscription;
			const stripeCustomerId = getStripeCustomerId(subscription.customer);
			const summary = getSubscriptionSummary(subscription);
			const kind = normalizeSubscriptionKind(subscription.metadata?.kind);

			if (stripeCustomerId) {
				await updateSubscriptionByCustomerId(stripeCustomerId, {
					...summary,
					...(kind ? { kind } : {})
				});
			}

			const userId =
				typeof subscription.metadata?.userId === "string" && subscription.metadata.userId.trim()
					? subscription.metadata.userId
					: null;

			if (userId) {
				const user = await findUserById(userId);
				if (user) {
					await upsertSubscriptionFromUser(user, {
						kind: kind ?? PLAN_KIND_BY_ID.growth,
						stripeCustomerId,
						...summary
					});
				}
			}

			break;
		}

		case "invoice.payment_succeeded":
		case "invoice.payment_failed": {
			const invoice = stripeEvent.data.object as Stripe.Invoice;
			const stripeCustomerId = getStripeCustomerId(invoice.customer);
			const stripeSubscriptionId = getStripeSubscriptionId(invoice.subscription);

			if (stripeCustomerId && stripeSubscriptionId) {
				const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
				const summary = getSubscriptionSummary(subscription);

				await updateSubscriptionByCustomerId(stripeCustomerId, {
					...summary,
					...(stripeEvent.type === "invoice.payment_failed"
						? { status: "past_due" as Stripe.Subscription.Status }
						: {})
				});
			} else if (stripeCustomerId && stripeEvent.type === "invoice.payment_failed") {
				await updateSubscriptionByCustomerId(stripeCustomerId, {
					status: "past_due" as Stripe.Subscription.Status
				});
			}

			break;
		}

		default:
			break;
	}
}

async function handleStripeWebhook(request: Request) {
	const stripeSignature = request.headers.get("stripe-signature");
	if (!stripeSignature) {
		return new Response("Missing Stripe signature", { status: 400 });
	}

	const webhookSecret = getRequiredEnv("STRIPE_WEBHOOK_SECRET");
	const payload = await request.text();

	let stripeEvent: Stripe.Event;
	try {
		stripeEvent = getStripeClient().webhooks.constructEvent(payload, stripeSignature, webhookSecret);
	} catch (error) {
		return new Response(`Webhook Error: ${toErrorMessage(error)}`, { status: 400 });
	}

	try {
		await handleWebhookEvent(stripeEvent);
		return json({ received: true }, { status: 200 });
	} catch (error) {
		return new Response(`Webhook Processing Error: ${toErrorMessage(error)}`, { status: 400 });
	}
}

export const GET: RequestHandler = async ({ request, cookies }) => {
	try {
		const user = await getAuthenticatedUser(request, cookies);
		if (!user) {
			return json({ status: false, error: "Unauthorized" }, { status: 401 });
		}

		const subscriptionCustomerModel = getSubscriptionCustomerModel();
		const customer = await subscriptionCustomerModel.findOne({ userId: user.id });

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

		return json(
			{
				status: true,
				subscribed: ACTIVE_SUBSCRIPTION_STATUSES.has(customer.status),
				subscription: {
					userId: customer.userId,
					kind: customer.kind,
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

export const POST: RequestHandler = async (event) => {
	try {
		if (event.request.headers.has("stripe-signature")) {
			return handleStripeWebhook(event.request);
		}

		let requestBody: CheckoutIntentBody;
		try {
			requestBody = (await event.request.json()) as CheckoutIntentBody;
		} catch {
			return json({ status: false, error: "Invalid request body" }, { status: 400 });
		}

		if (requestBody.action === "checkout") {
			return handleCheckoutIntent(event, requestBody);
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