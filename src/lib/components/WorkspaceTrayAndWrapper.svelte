<script lang=ts>
    import { goto } from "$app/navigation";
    import { getWorkspaceOwnershipLimit } from "$lib/subscription/limits";
    import {
        userHasActiveSubscription,
        userSubscriptionCheckInProgress,
        userSubscriptionKind
    } from "$lib/stores/subscription";
    import {
        avaiableWorkspaces,
        isWorkspaceDownloadInProgress,
        isWorkspaceInAddition,
        isWorkspaceSelectionOpen,
        selectedWorkspace
    } from "$lib/stores/workspace";
    import { setAlert } from "$lib/utils/alert";
    import { UI } from "@ravenlens/frontend";
    import type { WorkspaceUserEntryLoaded } from "$lib/sharedCompat";
    import type { ComponentProps } from "svelte";

    const ownedWorkspaceCount = $derived($avaiableWorkspaces.filter(workspace => workspace.isOwner).length);
    const maxOwnedWorkspaces = $derived(
        $userHasActiveSubscription && $userSubscriptionKind
            ? getWorkspaceOwnershipLimit($userSubscriptionKind)
            : null
    );
    const reachedWorkspaceOwnershipLimit = $derived(
        typeof maxOwnedWorkspaces === "number" && ownedWorkspaceCount >= maxOwnedWorkspaces
    );
    const canCreateWorkspace = $derived(
        !$userSubscriptionCheckInProgress
        && $userHasActiveSubscription
        && !reachedWorkspaceOwnershipLimit
    );

    function getWorkspaceCreateDisabledReason(): string {
        if ($userSubscriptionCheckInProgress) {
            return "Subscription status check is in progress.";
        }

        if (reachedWorkspaceOwnershipLimit && typeof maxOwnedWorkspaces === "number") {
            return `Your ${$userSubscriptionKind ?? "current"} plan allows up to ${maxOwnedWorkspaces} owned workspace${maxOwnedWorkspaces === 1 ? "" : "s"}. Upgrade your plan to create more.`;
        }

        return "Creating a workspace requires an active subscription.";
    }

    const newWorkspaceButtonDisabled = $derived<ComponentProps<UI.Workspace.WorkspaceTray>["newWorkspaceButtonDisabled"]>(
        canCreateWorkspace
            ? false
            : {
                disableReason: getWorkspaceCreateDisabledReason()
            }
    );

    function onSelectWorkspace(workspace: WorkspaceUserEntryLoaded) {
        return (ev?: Event) => {
            selectedWorkspace.selectWorkspace(workspace);
        };
    }

    async function onAddNewWorkspace(ev?: Event) {
        if (!canCreateWorkspace) {
            if ($userSubscriptionCheckInProgress) {
                return;
            }

            if (reachedWorkspaceOwnershipLimit && typeof maxOwnedWorkspaces === "number") {
                setAlert(
                    "warning",
                    "Workspace limit reached",
                    getWorkspaceCreateDisabledReason()
                );
            } else {
                setAlert("warning", "Active subscription required", getWorkspaceCreateDisabledReason());
            }

            return;
        }

        await goto("/");
        $isWorkspaceSelectionOpen = false;
        $isWorkspaceInAddition = true;
    }

    function onSurroundingClick() {
        $isWorkspaceSelectionOpen = false;
    }

    function onContentClick(ev: Event) {
        ev.stopPropagation();
        $isWorkspaceSelectionOpen = false;
    }
</script>

{#if $isWorkspaceSelectionOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <section
        class="absolute inset-0 z-50 flex items-center justify-center py-3 bg-base-100/40 backdrop-blur-md"
        onclick={onSurroundingClick}
    >
        {#if $isWorkspaceDownloadInProgress && !$avaiableWorkspaces.length}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                class="w-full h-full flex items-center justify-center"
                onclick={onContentClick}
            >
                <div class="flex items-center gap-3 rounded-xl border border-base-300 bg-base-100/80 px-5 py-4 shadow-lg">
                    <span class="loading loading-spinner loading-md" aria-label="Loading workspaces"></span>
                    <span class="text-sm font-medium text-base-content/80">Loading workspaces...</span>
                </div>
            </div>
        {:else}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
                class="w-1/2 h-full relative"
                onclick={onContentClick}
            >
                <UI.Workspace.WorkspaceTray
                    open={$isWorkspaceSelectionOpen}
                    selectedWorkspace={$selectedWorkspace}
                    avaiableWorkspaces={$avaiableWorkspaces}
                    {onSelectWorkspace}
                    {onAddNewWorkspace}
                    {newWorkspaceButtonDisabled}
                />
            </div>
        {/if}
    </section>
{/if}
