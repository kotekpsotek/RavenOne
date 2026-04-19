import { env } from "$env/dynamic/private";
import { getAuthenticatedPayload } from "$lib/server/auth/request";
import { DB_Models } from "@ravenlens/backend";
import type { SubscriptionKinds } from "$lib/sharedCompat";
import type { Cookies } from "@sveltejs/kit";
import type Stripe from "stripe";

export type LegacySubscriptionKind = "individual" | "company";

export type UserProfileRecord = {
	_id: unknown;
	id: string;
	email?: string;
	name?: string;
};

export type SubscriptionSummary = {
	stripeSubscriptionId: string;
	status: Stripe.Subscription.Status;
	priceId?: string;
	currentPeriodEnd?: Date;
	cancelAtPeriodEnd?: boolean;
};

export type SubscriptionCustomerPatch = {
	subscriptionKind?: SubscriptionKinds;
	stripeCustomerId?: string;
	stripeSubscriptionId?: string;
	status?: Stripe.Subscription.Status;
	priceId?: string;
	currentPeriodEnd?: Date;
	cancelAtPeriodEnd?: boolean;
};

/** ENV Key names in form of object */
export const PLAN_PRICE_ENV_KEY_BY_ID: Record<SubscriptionKinds, string> = {
	starter: "STRIPE_STARTER_PRICE_ID",
	growth: "STRIPE_GROWTH_PRICE_ID",
	enterprise: "STRIPE_ENTERPRISE_PRICE_ID"
};

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing"]);

export function toErrorMessage(error: unknown): string {
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

export function asNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length ? trimmed : undefined;
}

export function normalizeSubscriptionKind(value: unknown): SubscriptionKinds | null {
	if (value === "starter" || value === "growth" || value === "enterprise") {
		return value;
	}

	return null;
}

export function normalizeLegacySubscriptionKind(value: unknown): LegacySubscriptionKind | null {
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

	for (const [planId, envKey] of Object.entries(PLAN_PRICE_ENV_KEY_BY_ID) as [SubscriptionKinds, string][]) {
		const configuredPriceId = (env as Record<string, string | undefined>)[envKey]?.trim();
		if (configuredPriceId && configuredPriceId === priceId) {
			return planId;
		}
	}

	return null;
}

export function resolveSubscriptionKind(options: {
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

	const fromLegacyKind = normalizeLegacySubscriptionKind(options.legacyKind);
	if (fromLegacyKind === "company") {
		return "enterprise";
	}

	return options.fallback ?? "growth";
}

export function getStripeCustomerId(
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

export function getStripeSubscriptionId(
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

export function getSubscriptionSummary(subscription: Stripe.Subscription): SubscriptionSummary {
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

export async function getAuthenticatedUser(request: Request, cookies: Cookies): Promise<UserProfileRecord | null> {
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
	return user;
}

export async function findUserById(userId: string): Promise<UserProfileRecord | null> {
	const normalizedUserId = asNonEmptyString(userId);
	if (!normalizedUserId) {
		return null;
	}

	const user = await DB_Models.UserAccount.profileModel.findOne({ id: normalizedUserId });
	return user;
}

export async function upsertSubscriptionFromUser(
	user: UserProfileRecord,
	patch: SubscriptionCustomerPatch,
	options?: { upsert?: boolean }
): Promise<void> {
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

export async function updateSubscriptionByCustomerId(
	stripeCustomerId: string,
	patch: SubscriptionCustomerPatch,
	options?: { upsert?: boolean }
): Promise<void> {
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
