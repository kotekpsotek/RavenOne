<script lang="ts">
    import { getWorkspaceMembersLimit } from "$lib/subscription/limits";
    import { canManageWorkspaceFiles, workspaceHasActiveSubscription, workspaceSubscriptionCheckInProgress, workspaceSubscriptionKind } from "$lib/stores/subscription";
    import { theme } from "$lib/stores/theme";
    import { userProfile } from "$lib/stores/user";
    import { alertState, setAlert } from "$lib/utils/alert";
    import { fetchAuthenticated } from "$lib/utils/fetch";
    import { UI } from "@ravenlens/frontend";
    import type { WorkspaceForUser, WorkspaceMemberInvitement, WorkspaceUser } from "$lib/sharedCompat";
    import { onMount, type ComponentProps } from "svelte";
    import { selectedOptionItem } from "../default";
    import { deleteInvitementRequest, deleteMemberRequest, inviteMemberRequest, updateMemberPermissions } from "$lib/workspace-settings/connections";
    import { selectedWorkspace } from "$lib/stores/workspace";

    let workspaceLoaded = $state<WorkspaceForUser | undefined>(undefined);
    let users = $derived<WorkspaceUser[]>(workspaceLoaded?.workspaceMembers ?? []);
    let invitements = $derived<WorkspaceMemberInvitement[]>(workspaceLoaded?.workspaceInvitements ?? []);
    let ownerUserId = $derived<WorkspaceForUser["ownerUserId"] | undefined>(workspaceLoaded?.ownerUserId ?? undefined);
    const canManageWorkspaceMembers = $derived(!$workspaceSubscriptionCheckInProgress && $workspaceHasActiveSubscription);
    const maxWorkspaceMembers = $derived($workspaceSubscriptionKind ? getWorkspaceMembersLimit($workspaceSubscriptionKind) : null);
    const reachedWorkspaceMemberLimit = $derived(typeof maxWorkspaceMembers === "number" && users.length >= maxWorkspaceMembers);
    type WorkspaceMembersScreenProps = ComponentProps<UI.Workspace.Settings.WorkspaceMembersSettingScreen>;

    const onSetAlertState: ComponentProps<UI.Workspace.Settings.WorkspaceSettingsScreen>["onSetAlertState"] = (state) => {
        $alertState = state;
    };

    const inviteMemberRequestGuarded: WorkspaceMembersScreenProps["inviteMemberRequest"] = async (
        ...args: Parameters<WorkspaceMembersScreenProps["inviteMemberRequest"]>
    ) => {
        if (!canManageWorkspaceMembers) {
            setAlert("warning", "Active workspace subscription required", "Cannot invite members because this workspace has no active subscription.");
            return false;
        }

        if (reachedWorkspaceMemberLimit && typeof maxWorkspaceMembers === "number") {
            setAlert(
                "warning",
                "Plan upgrade required",
                `This workspace already has ${users.length} members. The ${$workspaceSubscriptionKind ?? "current"} plan allows up to ${maxWorkspaceMembers} members. Upgrade your plan to invite more members.`
            );

            return false;
        }

        return inviteMemberRequest(...args);
    };

    const updateMemberPermissionsGuarded: WorkspaceMembersScreenProps["updateMemberPermissions"] = async (
        ...args: Parameters<WorkspaceMembersScreenProps["updateMemberPermissions"]>
    ) => {
        if (!canManageWorkspaceMembers) {
            setAlert("warning", "Active workspace subscription required", "Cannot edit workspace member permissions because this workspace has no active subscription.");
            return false;
        }

        return updateMemberPermissions(...args);
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
                workspace: WorkspaceForUser;
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

<div class="relative">
    <UI.Workspace.Settings.WorkspaceMembersSettingScreen
        bind:users
        bind:invitements
        selectedWorkspace={workspaceLoaded!}
        selectedOption={$selectedOptionItem}
        theme={$theme}
        currentUser={$userProfile!}
        {fetchAuthenticated}
        {onSetAlertState}
        inviteMemberRequest={inviteMemberRequestGuarded}
        {deleteInvitementRequest}
        {deleteMemberRequest}
        updateMemberPermissions={updateMemberPermissionsGuarded}
        canUserManageWorkspaceMembers={$canManageWorkspaceFiles}
        canUserDeleteInvitements={$canManageWorkspaceFiles}
        canUserInviteMembers={$canManageWorkspaceFiles}
    />

    {#if !$canManageWorkspaceFiles && !$workspaceSubscriptionCheckInProgress}
        <div class="absolute top-0 w-full z-10 flex items-center justify-center p-4">
            <div class="alert alert-warning max-w-2xl text-sm">
                Active workspace subscription is required to invite members and edit member permissions.
            </div>
        </div>
    {/if}
</div>
