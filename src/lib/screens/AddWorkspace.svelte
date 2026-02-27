<script lang="ts">
    import { userProfile } from "$lib/stores/user";
    import { avaiableWorkspaces, isWorkspaceInAddition } from "$lib/stores/workspace";
    import { fetchAuthenticated } from "$lib/utils/fetch";
    import { UI } from "@ravenlens/frontend";
    import type { ComponentProps } from "svelte";

    export let open = false;
    
    // State
    let isProfileErrorVisible = true;

    // Handlers
    /** TODO: Call to add service and close with open = false */
    const onCreateWorkspace: ComponentProps<UI.Workspace.Management.AddWorkspaceScreen>["onCreate"] = async (workspaceName, workspaceInvitements) => {
        open = false;
    }

    // Helpers
    function toErrorMessage(err: unknown): string {
        if (err instanceof Error) return err.message;
        if (typeof err === "string") return err;
        try {
            return JSON.stringify(err);
        } catch {
            return String(err);
        }
    }
</script>

{#if open}
    {#await userProfile.download()}
        <div
            class="absolute top-4 right-4 z-40 flex items-center gap-3 rounded-box border border-base-300 bg-base-200/80 px-4 py-2 backdrop-blur-md"
            aria-live="polite"
        >
            <span class="loading loading-spinner loading-sm" aria-label="Loading"></span>
            <span class="text-sm font-medium opacity-80">Loading profile…</span>
        </div>
    {:then profile} 
        <UI.Workspace.Management.AddWorkspaceScreen
            bind:open
            avaiableWorkspaces={$avaiableWorkspaces}
            workspaceAdditionName=""
            currentUser={profile}
            onCreate={onCreateWorkspace}
            isSelectedClassStyle="after:bg-os2-100 after:font-semibold"
            {fetchAuthenticated}
        />
    {:catch err}
        {#if isProfileErrorVisible}
            <div class="absolute top-4 right-4 z-40 max-w-xl">
                <div class="alert alert-error shadow-lg">
                    <div class="flex flex-col gap-0.5">
                        <div class="font-semibold">Couldn’t load your profile</div>
                        <div class="text-sm opacity-80 break-words">{toErrorMessage(err)}</div>
                    </div>
                    <button
                        class="btn btn-ghost btn-sm"
                        aria-label="Dismiss error"
                        onclick={() => (isProfileErrorVisible = false)}
                    >
                        ✕
                    </button>
                </div>
            </div>
        {/if}
    {/await}
{/if}