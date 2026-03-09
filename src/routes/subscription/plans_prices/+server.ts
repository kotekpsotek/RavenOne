import { getRequiredEnv } from "$lib/server/env";
import { getStripeClient } from "$lib/server/stripe";
import type { SubscriptionKinds } from "@ravenlens/shared";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * WARNING: Price on Stripe have to be defined in dolars currency
*/

const planPrices: Record<Exclude<SubscriptionKinds, "enterprise">, string> = {
    starter: getRequiredEnv("STRIPE_STARTER_PRICE_ID"),
    growth: getRequiredEnv("STRIPE_GROWTH_PRICE_ID"),
    // enterprise: getRequiredEnv("STRIPE_ENTERPRISE_PRICE_ID")
}

function toAmountInDollars(price: { unit_amount: number | null; unit_amount_decimal: string | null }) {
    if (price.unit_amount_decimal !== null) {
        return Number(price.unit_amount_decimal) / 100;
    }

    if (price.unit_amount !== null) {
        return price.unit_amount / 100;
    }

    throw new Error("Stripe price does not contain a unit amount.");
}

/**
 * Return active prices for each plan in dollars
*/
export const GET: RequestHandler = async () => {
    const stripeClient = getStripeClient();

    const priceEntries = await Promise.all(
        (Object.entries(planPrices) as [SubscriptionKinds, string][]).map(async ([planId, priceId]) => {
            const stripePrice = await stripeClient.prices.retrieve(priceId);
            return [planId, toAmountInDollars(stripePrice)] as const;
        })
    );

    return json(
        Object.fromEntries(priceEntries) as Record<SubscriptionKinds, number>,
        {
            status: 200
        }
    );
}
