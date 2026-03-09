<script lang="ts">
    import { userHasActiveSubscription, userSubscriptionCheckInProgress } from "$lib/stores/subscription";
    import { userProfile } from "$lib/stores/user";
    import { avaiableWorkspaces, selectedWorkspace } from "$lib/stores/workspace";
    import { alertState } from "$lib/utils/alert";
    import { fetchAuthenticated } from "$lib/utils/fetch";
    import { UI } from "@ravenlens/frontend";
    import type { Workspace } from "@ravenlens/shared";
    import type { ComponentProps } from "svelte";

    let { open = $bindable(false) } = $props();
    const canCreateWorkspace = $derived(!$userSubscriptionCheckInProgress && $userHasActiveSubscription);

    type CreateWorkspaceResponseBody = {
        status?: boolean;
        message?: string;
        error?: string;
        workspace?: unknown;
    };

    function isWorkspaceEntry(value: unknown): value is Workspace.Workspace.WorkspaceUserEntryLoaded {
        if (!value || typeof value !== "object") {
            return false;
        }

        const candidate = value as Record<string, unknown>;
        return (
            typeof candidate.id === "string" &&
            typeof candidate.name === "string" &&
            typeof candidate.imageUrl === "string" &&
            typeof candidate.ownerUserId === "string" &&
            typeof candidate.isOwner === "boolean" &&
            Array.isArray(candidate.userPermissions)
        );
    }

    function setAlert(type: "success" | "error" | "warning", name: string, description: string) {
        alertState.set({
            alert: {
                type,
                name,
                description
            },
            timeoutMs: 5_000
        });
    }

    function upsertWorkspace(workspace: Workspace.Workspace.WorkspaceUserEntryLoaded) {
        avaiableWorkspaces.update(existingWorkspaces => {
            const existingIndex = existingWorkspaces.findIndex(existingWorkspace => existingWorkspace.id === workspace.id);
            if (existingIndex === -1) {
                return [...existingWorkspaces, workspace];
            }

            const nextWorkspaces = [...existingWorkspaces];
            nextWorkspaces[existingIndex] = workspace;
            return nextWorkspaces;
        });
    }
    
    // Handlers
    const onCreateWorkspace: ComponentProps<UI.Workspace.Management.AddWorkspaceScreen>["onCreate"] = async (workspaceName, workspaceInvitements) => {
        if (!canCreateWorkspace) {
            setAlert("warning", "Active subscription required", "Creating a workspace requires an active subscription.");
            return;
        }

        const normalizedWorkspaceName = workspaceName.trim();
        if (!normalizedWorkspaceName) {
            setAlert("warning", "Workspace name required", "Provide workspace name before creating it.");
            return;
        }

        let response: Response;
        try {
            response = await fetchAuthenticated("/workspace/create", {
                method: "POST",
                headers: {
                    "content-type": "application/json"
                },
                body: JSON.stringify({
                    workspaceName: normalizedWorkspaceName,
                    workspaceInvitements
                })
            });
        } catch {
            setAlert("error", "Workspace creation failed", "Cannot reach workspace creation service.");
            return;
        }

        let responseBody: CreateWorkspaceResponseBody | undefined;
        try {
            responseBody = (await response.json()) as CreateWorkspaceResponseBody;
        } catch {
            responseBody = undefined;
        }

        if (!response.ok || !responseBody?.status) {
            const errorMessage = responseBody?.error ?? `Cannot create workspace (${response.status})`;
            setAlert("error", "Workspace creation failed", errorMessage);
            return;
        }

        if (isWorkspaceEntry(responseBody.workspace)) {
            upsertWorkspace(responseBody.workspace);
            selectedWorkspace.set(responseBody.workspace);
        }

        setAlert("success", "Workspace created", responseBody.message ?? "Workspace was created successfully.");
        open = false;
    }

</script>

{#if open}
    <div class="relative">
        <div class={!canCreateWorkspace ? "pointer-events-none opacity-60" : ""}>
            <UI.Workspace.Management.AddWorkspaceScreen
                bind:open
                avaiableWorkspaces={$avaiableWorkspaces}
                workspaceAdditionName=""
                currentUser={$userProfile!}
                onCreate={onCreateWorkspace}
                isSelectedClassStyle="after:bg-os2-100 after:font-semibold"
                {fetchAuthenticated}
            />
        </div>

        {#if !canCreateWorkspace && !$userSubscriptionCheckInProgress}
            <div class="absolute inset-0 z-10 flex items-start justify-center p-4">
                <div class="alert alert-warning max-w-xl text-sm">
                    Active subscription is required to create a new workspace.
                </div>
            </div>
        {/if}
    </div>
{/if}