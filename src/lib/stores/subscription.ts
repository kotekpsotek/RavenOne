import { browser } from "$app/environment";
import { getWorkspaceActiveSubscription } from "$lib/subscription/utils";
import { fetchAuthenticated } from "$lib/utils/fetch";
import type { SubscriptionKinds } from "@ravenlens/shared";
import { derived, writable } from "svelte/store";
import { userProfile } from "./user";
import { selectedWorkspace } from "./workspace";

type WorkspaceSubscriptionState = {
    workspaceId?: string;
    checking: boolean;
    subscriptionKind?: SubscriptionKinds;
    endpointUnsupported: boolean;
};

type UserSubscriptionState = {
    checking: boolean;
    hasActiveSubscription: boolean;
    subscriptionKind?: SubscriptionKinds;
};

const workspaceSubscriptionState = writable<WorkspaceSubscriptionState>({
    checking: false,
    endpointUnsupported: false
});

const userSubscriptionState = writable<UserSubscriptionState>({
    checking: false,
    hasActiveSubscription: false
});

let workspaceCheckRequestId = 0;
let userSubscriptionRequestId = 0;

function normalizeIdentifier(value: string | null | undefined): string | undefined {
    if (!value) {
        return undefined;
    }

    const normalized = value.trim();
    return normalized.length ? normalized : undefined;
}

function asSubscriptionKind(value: unknown): SubscriptionKinds | undefined {
    if (value === "starter" || value === "growth" || value === "enterprise") {
        return value;
    }

    return undefined;
}

export async function refreshSelectedWorkspaceSubscriptionState(workspaceIdCandidate?: string): Promise<void> {
    const workspaceId = normalizeIdentifier(workspaceIdCandidate);
    const currentRequestId = ++workspaceCheckRequestId;

    if (!workspaceId) {
        workspaceSubscriptionState.set({
            checking: false,
            endpointUnsupported: false
        });
        return;
    }

    workspaceSubscriptionState.set({
        workspaceId,
        checking: true,
        endpointUnsupported: false
    });

    const subscriptionKind = await getWorkspaceActiveSubscription(workspaceId);
    console.log('Sub kind', subscriptionKind)
    if (currentRequestId !== workspaceCheckRequestId) {
        return;
    }

    if (subscriptionKind === false) {
        workspaceSubscriptionState.set({
            workspaceId,
            checking: false,
            endpointUnsupported: true
        });
        return;
    }

    workspaceSubscriptionState.set({
        workspaceId,
        checking: false,
        subscriptionKind: subscriptionKind ?? undefined,
        endpointUnsupported: false
    });
}

export async function refreshUserSubscriptionState(): Promise<void> {
    const currentRequestId = ++userSubscriptionRequestId;

    userSubscriptionState.update(state => ({
        ...state,
        checking: true
    }));

    let hasActiveSubscription = false;
    let subscriptionKind: SubscriptionKinds | undefined;

    try {
        const response = await fetchAuthenticated("/subscription", {
            method: "GET"
        });

        let responseBody: {
            status?: boolean;
            subscribed?: boolean;
            subscription?: {
                subscriptionKind?: unknown;
                kind?: unknown;
            } | null;
        } | null = null;
        try {
            responseBody = (await response.json()) as {
                status?: boolean;
                subscribed?: boolean;
                subscription?: {
                    subscriptionKind?: unknown;
                    kind?: unknown;
                } | null;
            };
        } catch {
            responseBody = null;
        }

        hasActiveSubscription = Boolean(
            response.ok
            && responseBody?.status
            && responseBody.subscribed
        );

        if (hasActiveSubscription) {
            subscriptionKind = asSubscriptionKind(responseBody?.subscription?.subscriptionKind)
                ?? asSubscriptionKind(responseBody?.subscription?.kind)
                ?? "growth";
        }
    } catch {
        hasActiveSubscription = false;
        subscriptionKind = undefined;
    }

    if (currentRequestId !== userSubscriptionRequestId) {
        return;
    }

    userSubscriptionState.set({
        checking: false,
        hasActiveSubscription,
        subscriptionKind
    });
}

export const workspaceSubscriptionCheckInProgress = derived(workspaceSubscriptionState, state => state.checking);
export const workspaceSubscriptionCheckUnsupported = derived(workspaceSubscriptionState, state => state.endpointUnsupported);
export const workspaceSubscriptionKind = derived(workspaceSubscriptionState, state => state.subscriptionKind);
export const workspaceHasActiveSubscription = derived(
    workspaceSubscriptionState,
    state => state.endpointUnsupported || Boolean(state.subscriptionKind)
);
export const canManageWorkspaceFiles = derived([workspaceSubscriptionCheckInProgress, workspaceHasActiveSubscription], ([workspaceSubscriptionCheckInProgress, workspaceHasActiveSubscription]) => {
    return !workspaceSubscriptionCheckInProgress && workspaceHasActiveSubscription;
})

export const userSubscriptionCheckInProgress = derived(userSubscriptionState, state => state.checking);
export const userHasActiveSubscription = derived(userSubscriptionState, state => state.hasActiveSubscription);
export const userSubscriptionKind = derived(userSubscriptionState, state => state.subscriptionKind);

if (browser) {
    selectedWorkspace.subscribe(workspace => {
        void refreshSelectedWorkspaceSubscriptionState(workspace?.id);
    });

    let startedUserSubscriptionSync = false;
    userProfile.subscribe(profile => {
        if (!profile || startedUserSubscriptionSync) {
            return;
        }

        startedUserSubscriptionSync = true;
        void refreshUserSubscriptionState();
    });
}
