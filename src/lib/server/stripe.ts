import Stripe from "stripe";
import { getRequiredEnv } from "./env";

export function getStripeClient() {
    return new Stripe(getRequiredEnv("STRIPE_SECRET_KEY"), {
        apiVersion: "2023-10-16",
        typescript: true
    });
}
