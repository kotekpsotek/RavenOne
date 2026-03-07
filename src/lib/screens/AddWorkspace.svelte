<script lang="ts">
    import { userProfile } from "$lib/stores/user";
    import { avaiableWorkspaces, selectedWorkspace } from "$lib/stores/workspace";
    import { alertState } from "$lib/utils/alert";
    import { fetchAuthenticated } from "$lib/utils/fetch";
    import { UI } from "@ravenlens/frontend";
    import type { Workspace } from "@ravenlens/shared";
    import type { ComponentProps } from "svelte";

    let { open = $bindable(false) } = $props();

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
    <UI.Workspace.Management.AddWorkspaceScreen
        bind:open
        avaiableWorkspaces={$avaiableWorkspaces}
        workspaceAdditionName=""
        currentUser={$userProfile!}
        onCreate={onCreateWorkspace}
        isSelectedClassStyle="after:bg-os2-100 after:font-semibold"
        {fetchAuthenticated}
    />
{/if}