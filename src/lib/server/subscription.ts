import { DB_Models } from "@ravenlens/backend";
import type { SubscriptionKinds } from "@ravenlens/shared";

type SubscriptionCustomerRecord = {
    status?: unknown;
    subscriptionKind?: unknown;
    kind?: unknown;
    currentPeriodEnd?: unknown;
};

type WorkspaceDocumentRaw = {
    ownerUserId?: unknown;
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const SUBSCRIPTION_KIND_STRENGTH: Record<SubscriptionKinds, number> = {
    starter: 1,
    growth: 2,
    enterprise: 3
};

function asNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
}

function asSubscriptionKind(value: unknown): SubscriptionKinds | undefined {
    if (value === "starter" || value === "growth" || value === "enterprise") {
        return value;
    }

    return undefined;
}

function asLegacySubscriptionKind(value: unknown): "individual" | "company" | undefined {
    if (value === "individual" || value === "company") {
        return value;
    }

    return undefined;
}

function resolveSubscriptionKind(options: {
    subscriptionKind?: unknown;
    legacyKind?: unknown;
    fallback?: SubscriptionKinds;
}): SubscriptionKinds {
    const normalizedSubscriptionKind = asSubscriptionKind(options.subscriptionKind);
    if (normalizedSubscriptionKind) {
        return normalizedSubscriptionKind;
    }

    const legacyKind = asLegacySubscriptionKind(options.legacyKind);
    if (legacyKind === "company") {
        return "enterprise";
    }

    return options.fallback ?? "growth";
}

function isActiveSubscriptionStatus(status: unknown): boolean {
    const normalizedStatus = asNonEmptyString(status)?.toLowerCase();
    return Boolean(normalizedStatus && ACTIVE_SUBSCRIPTION_STATUSES.has(normalizedStatus));
}

export function hasActiveSubscriptionAccess(subscription: {
    status?: unknown;
    currentPeriodEnd?: unknown;
}): boolean {
    if (!isActiveSubscriptionStatus(subscription.status)) {
        return false;
    }

    if (!(subscription.currentPeriodEnd instanceof Date)) {
        return true;
    }

    return Date.now() < subscription.currentPeriodEnd.getTime();
}

function getSubscriptionStrength(subscriptionKind: SubscriptionKinds): number {
    return SUBSCRIPTION_KIND_STRENGTH[subscriptionKind];
}

export type ActiveSubscriptionState = {
    hasActiveSubscription: boolean;
    subscriptionKind?: SubscriptionKinds;
};

export type WorkspaceActiveSubscriptionState = ActiveSubscriptionState & {
    workspaceFound: boolean;
    ownerUserId?: string;
};

export async function getUserActiveSubscription(userId: string): Promise<ActiveSubscriptionState> {
    const normalizedUserId = asNonEmptyString(userId);
    if (!normalizedUserId) {
        return {
            hasActiveSubscription: false
        };
    }

    const subscriptionCustomers = (await DB_Models.Subscription.subscriptionCustomerModel.find({
        userId: normalizedUserId
    }));

    // 1) Download subscriptions, 2) keep only active subscriptions.
    const activeSubscriptionKinds = (Array.isArray(subscriptionCustomers) ? subscriptionCustomers : [])
        .filter((subscriptionCustomer) => hasActiveSubscriptionAccess(subscriptionCustomer))
        .map((subscriptionCustomer) =>
            resolveSubscriptionKind({
                subscriptionKind: subscriptionCustomer.subscriptionKind,
                legacyKind: subscriptionCustomer.subscriptionKind,
                fallback: "growth"
            })
        );

    if (!activeSubscriptionKinds.length) {
        return {
            hasActiveSubscription: false
        };
    }

    // 3) Return the strongest active subscription by plan strength.
    const strongestActiveSubscriptionKind = activeSubscriptionKinds.reduce((strongestKind, currentKind) =>
        getSubscriptionStrength(currentKind) > getSubscriptionStrength(strongestKind)
            ? currentKind
            : strongestKind
    );

    return {
        hasActiveSubscription: true,
        subscriptionKind: strongestActiveSubscriptionKind
    };
}

export async function getWorkspaceActiveSubscription(workspaceId: string): Promise<WorkspaceActiveSubscriptionState> {
    const normalizedWorkspaceId = asNonEmptyString(workspaceId);
    if (!normalizedWorkspaceId) {
        return {
            workspaceFound: false,
            hasActiveSubscription: false
        };
    }

    const workspace = await DB_Models.Workspace.Workspace.workspaceModel
        .findOne({ id: normalizedWorkspaceId })
        .select({ ownerUserId: 1 })
        .lean<WorkspaceDocumentRaw>();

    if (!workspace) {
        return {
            workspaceFound: false,
            hasActiveSubscription: false
        };
    }

    const ownerUserId = asNonEmptyString(workspace.ownerUserId);
    if (!ownerUserId) {
        return {
            workspaceFound: true,
            hasActiveSubscription: false
        };
    }

    const subscription = await getUserActiveSubscription(ownerUserId);
    return {
        workspaceFound: true,
        ownerUserId,
        ...subscription
    };
}
