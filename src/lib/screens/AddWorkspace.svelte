<script lang="ts">
    import { avaiableWorkspaces } from "$lib/stores/workspace";
    import { fetchAuthenticated } from "$lib/utils/fetch";
    import { UI } from "@ravenlens/frontend";
    import type { ComponentProps } from "svelte";
    import ProfileLoader from "./ProfileLoader.svelte";
    import type { Profile } from "@ravenlens/shared";

    let { open = $bindable(false) } = $props();
    
    // Handlers
    /** TODO: Call to add service and close with open = false */
    const onCreateWorkspace: ComponentProps<UI.Workspace.Management.AddWorkspaceScreen>["onCreate"] = async (workspaceName, workspaceInvitements) => {
        open = false;
    }

</script>

{#if open}
    <ProfileLoader>
        {#snippet children(profile: Profile)}
            <UI.Workspace.Management.AddWorkspaceScreen
                bind:open
                avaiableWorkspaces={$avaiableWorkspaces}
                workspaceAdditionName=""
                currentUser={profile}
                onCreate={onCreateWorkspace}
                isSelectedClassStyle="after:bg-os2-100 after:font-semibold"
                {fetchAuthenticated}
            />
        {/snippet}
    </ProfileLoader>
{/if}