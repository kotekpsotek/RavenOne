import { getStripeClient } from "$lib/server/stripe";
import { DB_Models } from "@ravenlens/backend";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
	getAuthenticatedUser,
	getStripeCustomerId,
	getSubscriptionSummary,
	resolveSubscriptionKind,
	toErrorMessage,
	upsertSubscriptionFromUser,
	updateSubscriptionByCustomerId
} from "../common";

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
