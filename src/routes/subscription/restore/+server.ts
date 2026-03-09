import { env } from "$env/dynamic/private";
import { getAuthenticatedPayload } from "$lib/server/auth/request";
import { getStripeClient } from "$lib/server/stripe";
import { DB_Models } from "@ravenlens/backend";
import type { SubscriptionKinds } from "@ravenlens/shared";
import { json } from "@sveltejs/kit";
import type Stripe from "stripe";
import type { RequestHandler } from "./$types";

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

function normalizeSubscriptionKind(value: unknown): SubscriptionKinds | null {
	if (value === "starter" || value === "growth" || value === "enterprise") {
		return value;
	}

	return null;
}

function inferPlanIdFromPriceId(value: unknown): SubscriptionKinds | null {
	if (typeof value !== "string" || !value.trim()) {
		return null;
	}

	for (const [planId, envKey] of Object.entries(PLAN_PRICE_ENV_KEY_BY_ID) as [
		SubscriptionKinds,
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

	return options.fallback ?? "growth";
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
	customerSubscription: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
): string | null {
	if (!customerSubscription) {
		return null;
	}

	if (typeof customerSubscription === "string") {
		return customerSubscription;
	}

	return customerSubscription.id ?? null;
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
		{ upsert: options?.upsert ?? true }
	);
}

async function updateSubscriptionByCustomerId(
	stripeCustomerId: string,
	patch: SubscriptionCustomerPatch,
	options?: { upsert?: boolean }
) {
	await DB_Models.Subscription.subscriptionCustomerModel.updateOne(
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

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const user = await getAuthenticatedUser(request, cookies);
		if (!user) {
			return json({ status: false, error: "Unauthorized" }, { status: 401 });
		}

		const customerSubscription = await DB_Models.Subscription.subscriptionCustomerModel.findOne({ userId: user.id });
		const stripeSubscriptionId =
			typeof customerSubscription?.stripeSubscriptionId === "string"
				? customerSubscription.stripeSubscriptionId.trim()
				: "";

		if (!stripeSubscriptionId) {
			return json({ status: false, error: "No active subscription" }, { status: 400 });
		}

        // Update at stripe
		const stripe = getStripeClient();
		const restoredSubscription = await stripe.subscriptions.update(stripeSubscriptionId, {
			cancel_at_period_end: false
		});

        // Prepare the subscription
		const summary = getSubscriptionSummary(restoredSubscription);
		const stripeCustomerId =
			getStripeCustomerId(restoredSubscription.customer) ??
			(typeof customerSubscription?.stripeCustomerId === "string" ? customerSubscription.stripeCustomerId : undefined);

		const subscriptionKind = resolveSubscriptionKind({
			subscriptionKind: restoredSubscription.metadata?.subscriptionKind,
			planId: restoredSubscription.metadata?.planId,
			priceId: summary.priceId,
			fallback: resolveSubscriptionKind({
				subscriptionKind: customerSubscription?.subscriptionKind,
				priceId: customerSubscription?.priceId,
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
				message: "Subscription restored",
				subscription: {
					subscriptionKind,
					...summary,
					stripeCustomerId
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
