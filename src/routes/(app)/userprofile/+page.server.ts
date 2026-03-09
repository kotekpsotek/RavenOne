import { error, redirect } from "@sveltejs/kit";
import type { ProfilePageLoadData } from "@ravenlens/shared";
import type { PageServerLoad } from "./$types";

type ProfileSubscription = ProfilePageLoadData["subscription"];
type ProfileSubscriptionKind = ProfileSubscription["plan"]["kind"];

type MeResponse = {
    user?: Partial<ProfilePageLoadData["profile"]>;
    error?: string;
    message?: string;
};

type SubscriptionRouteResponse = {
    status?: boolean;
    subscribed?: boolean;
    subscription?: {
        userId?: string;
        subscriptionKind?: string;
        kind?: string;
        status?: string;
        priceId?: string;
        currentPeriodEnd?: unknown;
    } | null;
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

function normalizeSubscriptionKind(value: unknown): ProfileSubscriptionKind {
    const normalized = String(value ?? "growth").trim().toLowerCase();
    if (normalized === "enterprise" || normalized === "company") {
        return "company" as ProfileSubscriptionKind;
    }

    return "individual" as ProfileSubscriptionKind;
}

function normalizeSubscriptionStatus(value: unknown): ProfileSubscription["status"] {
    const normalized = String(value ?? "none").trim().toLowerCase();
    return (normalized || "none") as ProfileSubscription["status"];
}

function createDefaultSubscription(profileId: string, seedDate: Date): ProfileSubscription {
    return {
        userId: profileId,
        status: "none",
        initializedOn: seedDate,
        renewsOn: seedDate,
        plan: {
            planId: "",
            kind: "individual",
            name: "",
            price: 0,
            currency: { currency: "USD" },
            period: {
                from: seedDate,
                to: seedDate
            },
            features: [],
            subscriptionPowerAndType: {
                type: "individual",
                maxWorkspaces: 1
            }
        }
    };
}

function mapSubscriptionFromRoute(
    profile: ProfilePageLoadData["profile"],
    body: SubscriptionRouteResponse
): ProfileSubscription {
    const defaultSubscription = createDefaultSubscription(profile.id, profile.createdAt);

    if (!body.subscription) {
        return defaultSubscription;
    }

    const subscriptionKind = normalizeSubscriptionKind(
        body.subscription.subscriptionKind ?? body.subscription.kind
    );
    const renewsOn = toDate(body.subscription.currentPeriodEnd ?? profile.createdAt);
    const priceId = String(body.subscription.priceId ?? "");

    return {
        ...defaultSubscription,
        userId: String(body.subscription.userId ?? profile.id),
        status: normalizeSubscriptionStatus(body.subscription.status),
        renewsOn,
        plan: {
            ...defaultSubscription.plan,
            planId: priceId,
            kind: subscriptionKind,
            name: priceId,
            period: {
                from: defaultSubscription.initializedOn,
                to: renewsOn
            },
            subscriptionPowerAndType: {
                ...defaultSubscription.plan.subscriptionPowerAndType,
                type: subscriptionKind,
                maxWorkspaces: subscriptionKind === "company" ? 25 : 1
            }
        }
    };
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

    let subscription = createDefaultSubscription(profile.id, profile.createdAt);
    const subscriptionResponse = await fetch("/subscription", {
        method: "GET"
    });

    if (subscriptionResponse.status === 401) {
        throw redirect(307, "/auth/login");
    }

    if (subscriptionResponse.ok) {
        try {
            const subscriptionBody = (await subscriptionResponse.json()) as SubscriptionRouteResponse;
            subscription = mapSubscriptionFromRoute(profile, subscriptionBody);
        } catch {
            subscription = createDefaultSubscription(profile.id, profile.createdAt);
        }
    }

    return {
        profile,
        subscription
    } satisfies ProfilePageLoadData;
}
