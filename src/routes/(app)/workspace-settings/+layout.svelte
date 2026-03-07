<script lang=ts>
    import { UI } from "@ravenlens/frontend";
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import ProfileLoader from "$lib/screens/ProfileLoader.svelte";
    import { selectedWorkspace } from "$lib/stores/workspace";
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
