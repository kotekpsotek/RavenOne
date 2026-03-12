import type { AI, SubscriptionKinds } from "@ravenlens/shared";

export type SubscriptionPlanLimit = number | null;

export type SubscriptionPlanLimits = {
    maxOwnedWorkspaces: SubscriptionPlanLimit;
    maxWorkspaceMembers: SubscriptionPlanLimit;
};

const SUBSCRIPTION_LIMITS: Record<SubscriptionKinds, SubscriptionPlanLimits> = {
    starter: {
        maxOwnedWorkspaces: 1,
        maxWorkspaceMembers: 5
    },
    growth: {
        maxOwnedWorkspaces: 5,
        maxWorkspaceMembers: 15
    },
    enterprise: {
        maxOwnedWorkspaces: null,
        maxWorkspaceMembers: null
    }
};

export function getSubscriptionPlanLimits(subscriptionKind: SubscriptionKinds): SubscriptionPlanLimits {
    return SUBSCRIPTION_LIMITS[subscriptionKind];
}

export function getWorkspaceOwnershipLimit(subscriptionKind: SubscriptionKinds): SubscriptionPlanLimit {
    return SUBSCRIPTION_LIMITS[subscriptionKind].maxOwnedWorkspaces;
}

export function getWorkspaceMembersLimit(subscriptionKind: SubscriptionKinds): SubscriptionPlanLimit {
    return SUBSCRIPTION_LIMITS[subscriptionKind].maxWorkspaceMembers;
}

export function isPlanLimitReached(limit: SubscriptionPlanLimit, currentCount: number): boolean {
    return typeof limit === "number" && currentCount >= limit;
}
