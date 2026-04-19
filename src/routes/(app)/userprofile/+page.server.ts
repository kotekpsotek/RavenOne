import { error, redirect } from "@sveltejs/kit";
import type { ProfilePageLoadData, SubscriptionKinds } from "$lib/sharedCompat";
import type { PageServerLoad } from "./$types";
import type { SubscriptionResponse } from "../../subscription/universal.types";

type ProfileSubscription = ProfilePageLoadData["subscription"];

type MeResponse = {
    user?: Partial<ProfilePageLoadData["profile"]>;
    error?: string;
    message?: string;
};

function toDate(value: unknown): Date {
    const parsedDate = value instanceof Date ? value : new Date(String(value ?? ""));

    if (Number.isNaN(parsedDate.getTime())) {
        return new Date();
    }

    return parsedDate;
}

function normalizeAccountType(value: unknown): ProfilePageLoadData["profile"]["mainAccountType"] {
    const normalized = String(value ?? "email").trim();
    return (normalized || "email") as ProfilePageLoadData["profile"]["mainAccountType"];
}

function normalizeLinkedAccounts(value: unknown): ProfilePageLoadData["profile"]["linkedAccounts"] {
    if (!Array.isArray(value)) {
        return [] as ProfilePageLoadData["profile"]["linkedAccounts"];
    }

    return value
        .map((account) => String(account ?? "").trim())
        .filter((account) => account.length > 0) as ProfilePageLoadData["profile"]["linkedAccounts"];
}

async function toResponseError(response: Response): Promise<string> {
    try {
        const responseBody = (await response.json()) as { error?: string; message?: string };
        if (responseBody.error) return responseBody.error;
        if (responseBody.message) return responseBody.message;
    } catch {
        // Ignore JSON parsing issues and use fallback status message.
    }

    return `Request failed with status ${response.status}`;
}

function mapSubscriptionFromRoute(
    body: SubscriptionResponse
): ProfileSubscription {
    if (body.status === false) {
        return undefined;
    }

    const priceId = String(body.subscription.priceId ?? "");
    return {
        priceId,
        status: body.subscription.status,
        createdAt: body.subscription.createdAt,
        cancelAtPeriodEnd: body.subscription.cancelAtPeriodEnd,
        currentPeriodEnd: body.subscription.currentPeriodEnd,
        updatedAt: body.subscription.updatedAt,
        subscriptionKind: body.subscription.subscriptionKind
    } satisfies ProfilePageLoadData["subscription"];
}

// TODO: Add handling for showing the canceled subscription
export const load: PageServerLoad = async ({ fetch }) => {
    const meResponse = await fetch("/auth/me", {
        method: "GET"
    });

    if (meResponse.status === 401) {
        throw redirect(307, "/auth/login");
    }

    if (!meResponse.ok) {
        throw error(meResponse.status, await toResponseError(meResponse));
    }

    let meBody: MeResponse;
    try {
        meBody = (await meResponse.json()) as MeResponse;
    } catch {
        throw error(500, "Invalid profile response from /auth/me");
    }

    const user = meBody.user;
    if (!user) {
        throw error(500, "Profile response did not include user data");
    }

    const profile: ProfilePageLoadData["profile"] = {
        id: String(user.id ?? ""),
        name: String(user.name ?? ""),
        mainAccountType: normalizeAccountType(user.mainAccountType),
        linkedAccounts: normalizeLinkedAccounts(user.linkedAccounts),
        createdAt: toDate(user.createdAt)
    };

    let subscription: ProfilePageLoadData["subscription"] = undefined;
    const subscriptionResponse = await fetch("/subscription", {
        method: "GET"
    });

    if (subscriptionResponse.status === 401) {
        throw redirect(307, "/auth/login");
    }

    if (subscriptionResponse.ok) {
        try {
            const subscriptionBody = (await subscriptionResponse.json()) as SubscriptionResponse;
            subscription = mapSubscriptionFromRoute(subscriptionBody);
        } catch {
            subscription = undefined;
        }
    }

    return {
        profile,
        subscription
    } satisfies ProfilePageLoadData;
}
