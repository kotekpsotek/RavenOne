import type { SubscriptionKinds } from "@ravenlens/shared";
import type Stripe from "stripe";

export interface SubscriptionResponseSuccess {
    status: true;
    subscribed: boolean;
    subscription: {
        createdAt: Date;
        updatedAt: Date;
        userId?: string;
        subscriptionKind: SubscriptionKinds;
        status?: Stripe.Subscription.Status;
        stripeCustomerId?: string;
        stripeSubscriptionId?: string;
        priceId?: string;
        currentPeriodEnd?: Date;
        cancelAtPeriodEnd?: boolean;
    }
}

export interface SubscriptionResponseFailure {
    status: false;
    error: string;
}

export type SubscriptionResponse = SubscriptionResponseSuccess | SubscriptionResponseFailure;
