import { DB_Models } from "@ravenlens/backend";
import type { SubscriptionKinds } from "@ravenlens/shared";

type SubscriptionCustomerRecord = {
    status?: unknown;
    subscriptionKind?: unknown;
    kind?: unknown;
};

type WorkspaceDocumentRaw = {
    ownerUserId?: unknown;
};

type SubscriptionCustomerModelLike = {
    findOne(query: Record<string, unknown>): Promise<SubscriptionCustomerRecord | null>;
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

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

function getSubscriptionCustomerModel(): SubscriptionCustomerModelLike {
    const models = DB_Models as unknown as {
        Subscriptions?: { subscriptionCustomerModel?: SubscriptionCustomerModelLike };
        Subscription?: { subscriptionCustomerModel?: SubscriptionCustomerModelLike };
    };

    const model =
        models.Subscriptions?.subscriptionCustomerModel ?? models.Subscription?.subscriptionCustomerModel;

    if (!model) {
        throw new Error("DB_Models.Subscription.subscriptionCustomerModel is not available");
    }

    return model;
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

    const subscriptionCustomerModel = getSubscriptionCustomerModel();
    const subscriptionCustomer = await subscriptionCustomerModel.findOne({ userId: normalizedUserId });

    const subscriptionStatus = asNonEmptyString(subscriptionCustomer?.status)?.toLowerCase();
    const hasActiveSubscription = Boolean(
        subscriptionStatus && ACTIVE_SUBSCRIPTION_STATUSES.has(subscriptionStatus)
    );

    return {
        hasActiveSubscription,
        subscriptionKind: hasActiveSubscription
            ? resolveSubscriptionKind({
                subscriptionKind: subscriptionCustomer?.subscriptionKind,
                legacyKind: subscriptionCustomer?.kind,
                fallback: "growth"
            })
            : undefined
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
