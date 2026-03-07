<script lang=ts>
    import { UI } from "@ravenlens/frontend";
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import ProfileLoader from "$lib/screens/ProfileLoader.svelte";
    import { avaiableWorkspaces, selectedWorkspace } from "$lib/stores/workspace";
    import { theme } from "$lib/stores/theme";
    import type { Profile, Workspace } from "@ravenlens/shared";
    import { fetchAuthenticated } from "$lib/utils/fetch";
    import { onDestroy, type ComponentProps, type Snippet } from "svelte";
    import { alertState } from "$lib/utils/alert";
    import { defaultAvaiableOptions } from ".";

    type DownloadWorkspaceForUserResponse = {
        status: boolean;
        workspace?: Workspace.Workspace.WorkspaceForUser;
        error?: string;
    };

    type DeleteWorkspaceResponse = {
        status?: boolean;
        deleted?: boolean;
        workspaceId?: string;
        error?: string;
    };

    type SaveWorkspaceResponse = {
        status?: boolean;
        saved?: boolean;
        workspace?: {
            id?: string;
            name?: string;
            imageUrl?: string;
            ownerUserId?: string;
        };
        error?: string;
    };

    type LayoutProps = {
        children?: Snippet;
    };

    let { children: layoutChildren }: LayoutProps = $props();

    let workspaceLoaded = $state<Workspace.Workspace.WorkspaceForUser | undefined>(undefined);
    let loadedWorkspaceId = "";
    let activeWorkspaceId = "";
    let isWorkspaceLoading = $state(false);

    const onSetAlertState: ComponentProps<UI.Workspace.Settings.WorkspaceSettingsScreen>["onSetAlertState"] = (state) => {
        $alertState = state;
    };

    function getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }

        if (typeof error === "string") {
            return error;
        }

        return "Failed to load selected workspace settings";
    }

    function setAlert(type: "success" | "error" | "warning", name: string, description: string) {
        $alertState = {
            alert: {
                type,
                name,
                description
            },
            timeoutMs: 5_000
        };
    }

    function isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === "object" && value !== null;
    }

    function asNonEmptyString(value: unknown): string | undefined {
        if (typeof value !== "string") {
            return undefined;
        }

        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
    }

    function readImageFile(image: unknown): File | null {
        if (!isRecord(image)) {
            return null;
        }

        const imageCandidate = image.imageFile;
        if (!(imageCandidate instanceof File) || imageCandidate.size <= 0) {
            return null;
        }

        return imageCandidate;
    }

    function readImageUrl(image: unknown): string | undefined {
        if (!isRecord(image)) {
            return undefined;
        }

        return asNonEmptyString(image.url);
    }

    async function downloadWorkspaceForUser(workspaceId: string) {
        isWorkspaceLoading = true;
        workspaceLoaded = undefined;

        try {
            const response = await fetchAuthenticated(`/workspace-for-user?workspaceId=${encodeURIComponent(workspaceId)}`, {
                method: "GET"
            });

            let responseBody: DownloadWorkspaceForUserResponse | undefined;
            try {
                responseBody = await response.json() as DownloadWorkspaceForUserResponse;
            } catch {
                responseBody = undefined;
            }

            if (!response.ok) {
                throw new Error(responseBody?.error ?? `Cannot load workspace (status ${response.status})`);
            }

            if (!responseBody?.workspace) {
                throw new Error(responseBody?.error ?? "Workspace payload is empty");
            }

            if (activeWorkspaceId !== workspaceId) {
                return;
            }

            workspaceLoaded = responseBody.workspace;
        } catch (error) {
            $alertState = {
                alert: {
                    type: "error",
                    name: "Workspace settings load failed",
                    description: getErrorMessage(error)
                },
                timeoutMs: 5_000
            };
        } finally {
            isWorkspaceLoading = false;
        }
    }

    const onSaveWorkspaceChanges: ComponentProps<UI.Workspace.Settings.WorkspaceSettingsScreen>["onSaveWorkspaceChanges"] = async (name, image) => {
        const currentWorkspaceLoaded = workspaceLoaded;
        if (!currentWorkspaceLoaded?.id) {
            setAlert("warning", "Workspace save unavailable", "Select workspace before trying to save changes.");
            return false;
        }

        const workspaceId = currentWorkspaceLoaded.id;

        const normalizedWorkspaceName = name.trim();
        if (!normalizedWorkspaceName) {
            setAlert("warning", "Workspace name required", "Workspace name cannot be empty.");
            return false;
        }

        const formData = new FormData();
        formData.set("workspaceId", workspaceId);
        formData.set("name", normalizedWorkspaceName);

        const imageFile = readImageFile(image);
        if (imageFile) {
            formData.set("image", imageFile);
        } else {
            const imageUrl = readImageUrl(image);
            if (imageUrl) {
                formData.set("imageUrl", imageUrl);
            }
        }

        let response: Response;
        try {
            response = await fetchAuthenticated(`/workspace-settings/api?workspaceId=${encodeURIComponent(workspaceId)}`, {
                method: "POST",
                body: formData
            });
        } catch {
            setAlert("error", "Workspace save failed", "Cannot reach workspace settings service.");
            return false;
        }

        let responseBody: SaveWorkspaceResponse | undefined;
        try {
            responseBody = await response.json() as SaveWorkspaceResponse;
        } catch {
            responseBody = undefined;
        }

        if (!response.ok || !responseBody?.status || !responseBody.saved) {
            const errorMessage = responseBody?.error ?? `Cannot save workspace changes (${response.status})`;
            setAlert("error", "Workspace save failed", errorMessage);
            return false;
        }

        const savedName = asNonEmptyString(responseBody.workspace?.name) ?? normalizedWorkspaceName;
        const savedImageUrl = asNonEmptyString(responseBody.workspace?.imageUrl)
            ?? asNonEmptyString(currentWorkspaceLoaded.imageUrl)
            ?? "";

        workspaceLoaded = {
            ...currentWorkspaceLoaded,
            name: savedName,
            imageUrl: savedImageUrl
        };

        let savedWorkspaceEntry: Workspace.Workspace.WorkspaceUserEntryLoaded | undefined;
        avaiableWorkspaces.update(existingWorkspaces => {
            const updatedWorkspaces = existingWorkspaces.map(workspace => {
                if (workspace.id !== workspaceId) {
                    return workspace;
                }

                const updatedWorkspace = {
                    ...workspace,
                    name: savedName,
                    imageUrl: savedImageUrl
                };

                savedWorkspaceEntry = updatedWorkspace;
                return updatedWorkspace;
            });

            return updatedWorkspaces;
        });

        if (savedWorkspaceEntry) {
            selectedWorkspace.set(savedWorkspaceEntry);
        }

        setAlert("success", "Workspace saved", "Workspace changes were saved successfully.");
        return true;
    }

    const onDeleteWorkspace: ComponentProps<UI.Workspace.Settings.WorkspaceSettingsScreen>["onDeleteWorkspace"] = async () => {
        const workspaceId = workspaceLoaded?.id;
        if (!workspaceId) {
            setAlert("warning", "Workspace deletion unavailable", "Select workspace before trying to delete it.");
            return false;
        }

        let response: Response;
        try {
            response = await fetchAuthenticated(`/workspace-settings/api?workspaceId=${encodeURIComponent(workspaceId)}`, {
                method: "DELETE"
            });
        } catch {
            setAlert("error", "Workspace deletion failed", "Cannot reach workspace deletion service.");
            return false;
        }

        let responseBody: DeleteWorkspaceResponse | undefined;
        try {
            responseBody = await response.json() as DeleteWorkspaceResponse;
        } catch {
            responseBody = undefined;
        }

        if (!response.ok || !responseBody?.status || !responseBody.deleted) {
            const errorMessage = responseBody?.error ?? `Cannot delete workspace (${response.status})`;
            setAlert("error", "Workspace deletion failed", errorMessage);
            return false;
        }

        let remainingWorkspaces: Workspace.Workspace.WorkspaceUserEntryLoaded[] = [];
        avaiableWorkspaces.update(existingWorkspaces => {
            remainingWorkspaces = existingWorkspaces.filter(workspace => workspace.id !== workspaceId);
            return remainingWorkspaces;
        });

        workspaceLoaded = undefined;
        loadedWorkspaceId = "";
        activeWorkspaceId = "";

        selectedWorkspace.set(remainingWorkspaces[0]);
        setAlert("success", "Workspace deleted", "Workspace was deleted successfully.");
        return true;
    };
    
    const unsubscribePage = page.subscribe(($page) => {
        if (!browser) {
            return;
        }

        if ($page.url.pathname.endsWith("/workspace-settings")) {
            void goto("/workspace-settings/common");
        }
    });

    const unsubscribeWorkspace = selectedWorkspace.subscribe((workspace) => {
        if (!browser) {
            return;
        }

        const workspaceId = workspace?.id ?? "";
        activeWorkspaceId = workspaceId;

        if (!workspaceId) {
            workspaceLoaded = undefined;
            loadedWorkspaceId = "";
        } else if (workspaceId !== loadedWorkspaceId) {
            loadedWorkspaceId = workspaceId;
            void downloadWorkspaceForUser(workspaceId);
        }
    });

    onDestroy(() => {
        unsubscribePage();
        unsubscribeWorkspace();
    });
</script>

<UI.Common.PageWrapper
    additionalClass="p-10"
>
    <ProfileLoader>
        {#snippet children(profile: Profile)}
            {#if workspaceLoaded}
                <UI.Workspace.Settings.WorkspaceSettingsScreen
                    open={true}
                    user={profile}
                    theme={$theme}
                    avaiableOptions={[...$defaultAvaiableOptions]}
                    selectedWorkspace={workspaceLoaded}
                    {fetchAuthenticated}
                    {onSetAlertState}
                    {onDeleteWorkspace}
                    {onSaveWorkspaceChanges}
                >
                    {@render layoutChildren?.()}
                </UI.Workspace.Settings.WorkspaceSettingsScreen>
            {:else if isWorkspaceLoading}
                <div class="px-4 py-6 text-sm text-base-content/70">Loading workspace settings...</div>
            {:else}
                <div class="px-4 py-6 text-sm text-base-content/70">Select a workspace to view settings.</div>
            {/if}
        {/snippet}
    </ProfileLoader>
</UI.Common.PageWrapper>
