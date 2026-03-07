<script lang=ts>
    import { goto } from "$app/navigation";
    import { avaiableWorkspaces, isAddNewWorkspaceBtnDisabled, isWorkspaceDownloadInProgress, isWorkspaceInAddition, isWorkspaceSelectionOpen, selectedWorkspace } from "$lib/stores/workspace";
    import { UI } from "@ravenlens/frontend";
    import { Workspace } from "@ravenlens/shared";

    function onSelectWorkspace(workspace: Workspace.Workspace.WorkspaceUserEntryLoaded) {
        return (ev?: Event) => {
            $selectedWorkspace = workspace;
        };
    }

    async function onAddNewWorkspace(ev?: Event) {
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
                        newWorkspaceButtonDisabled={isAddNewWorkspaceBtnDisabled()}
                    />
                </div>
            {/if}
        </section>
    {/if}