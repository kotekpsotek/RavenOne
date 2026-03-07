<script lang="ts">
    import { theme } from "$lib/stores/theme";
    import { userProfile } from "$lib/stores/user";
    import { alertState } from "$lib/utils/alert";
    import { fetchAuthenticated } from "$lib/utils/fetch";
    import { UI } from "@ravenlens/frontend";
    import { Workspace } from "@ravenlens/shared";
    import { onMount, type ComponentProps } from "svelte";
    import { selectedOptionItem } from "../default";
    import { deleteInvitementRequest, deleteMemberRequest, inviteMemberRequest, updateMemberPermissions } from "$lib/workspace-settings/connections";
    import { selectedWorkspace } from "$lib/stores/workspace";

    let workspaceLoaded = $state<Workspace.Workspace.WorkspaceForUser | undefined>(undefined);
    let users = $derived<Workspace.Workspace.WorkspaceUser[]>(workspaceLoaded?.workspaceMembers ?? []);
    let invitements = $derived<Workspace.Workspace.WorkspaceMemberInvitement[]>(workspaceLoaded?.workspaceInvitements ?? []);
    let ownerUserId = $derived<Workspace.Workspace.WorkspaceForUser["ownerUserId"] | undefined>(workspaceLoaded?.ownerUserId ?? undefined);

    const onSetAlertState: ComponentProps<UI.Workspace.Settings.WorkspaceSettingsScreen>["onSetAlertState"] = (state) => {
        $alertState = state;
    };

    onMount(async () => {
        // Invitements
        const workspaceDownloaded = await fetchAuthenticated(`/workspace-for-user?workspaceId=${$selectedWorkspace?.id}`, {
            method: "POST",
            headers: {
                'Content-Type': "application/json"
            },
            body: JSON.stringify({ workspaceId: $selectedWorkspace?.id })
        });

        if (workspaceDownloaded.ok) {
            const resBody = await workspaceDownloaded.json() as {
                status: boolean;
                workspace: Workspace.Workspace.WorkspaceForUser;
            };

            if (!resBody.status) {
                console.error(`Cannot download workspace data because of falsy status`);
                return;
            }
            
            workspaceLoaded = resBody.workspace;
        }
        else console.error('Cannot download workspace', workspaceDownloaded.status);
    });
</script>

<UI.Workspace.Settings.WorkspaceMembersSettingScreen
    bind:users
    bind:invitements
    selectedWorkspace={workspaceLoaded!}
    selectedOption={$selectedOptionItem}
    theme={$theme}
    currentUser={$userProfile!}
    {fetchAuthenticated}
    {onSetAlertState}
    {inviteMemberRequest}
    {deleteInvitementRequest}
    {deleteMemberRequest}
    {updateMemberPermissions}
/>
