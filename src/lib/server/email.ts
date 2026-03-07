import { env } from "$env/dynamic/private";
import { Resend } from "resend";

export function getResendInstance() {
    const resendApiKey = env.RESEND_API_KEY?.trim();
    const resendFromEmail = env.RESEND_FROM_EMAIL?.trim();

    if (!resendApiKey) {
        throw new Error("RESEND_API_KEY is not configured");
    }
    if (!resendFromEmail) {
        throw new Error("RESEND_FROM_EMAIL is not configured");
    }

    return new Resend(resendApiKey);
}