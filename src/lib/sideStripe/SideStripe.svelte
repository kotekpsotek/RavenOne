<script lang="ts">
    import Icon from "@iconify/svelte";
    import { onMount } from 'svelte';
    import { userProfile as user } from "../stores/user";
    import { UI } from "@ravenlens/frontend"
    import { syncThemeMode, theme, toggleThemeMode } from "../stores/theme";
    import { goto } from "$app/navigation";
    import ExpansionPanel from "./ExpansionPanel.svelte";
    import { isWorkspaceSelectionOpen, selectedWorkspace } from "$lib/stores/workspace";
    import { getFirstAllowedWorkspaceSettingsPath } from "$lib/workspace-settings/permissions";
    import { isSearchModalOpen } from "$lib/stores/files";
    import { appName } from "$lib/config/app";
    import { isSharedRoute } from "$lib/stores/share";

    let isExpanded = $state(false);
    const PANEL_WIDTH_STORAGE_KEY = 'expansion-panel-width';
    const PANEL_MIN_WIDTH = 260;
    const PANEL_MAX_WIDTH = 640;
    const COLLAPSED_WIDTH = 56;

    let panelWidth = $state(320);
    let isResizing = $state(false);
    let isResizeHandleHovered = $state(false);

    let startClientX = 0;
    let startPanelWidth = 0;
    let workspaceSettingsPath = $derived(getFirstAllowedWorkspaceSettingsPath($selectedWorkspace));
    let canOpenWorkspaceSettings = $derived(Boolean(workspaceSettingsPath));

    const unspecifiedWorkspaceName = "Unspecified Workspace";
    let isSomeWorkspaceSelected = $derived($selectedWorkspace !== undefined);

    onMount(() => {
        syncThemeMode();

        const storedPanelWidth = Number(localStorage.getItem(PANEL_WIDTH_STORAGE_KEY));
        if (Number.isFinite(storedPanelWidth) && storedPanelWidth > 0) {
            panelWidth = clampWidth(storedPanelWidth);
        }

        return () => {
            stopResize();
        };
    });

    function clampWidth(width: number) {
        return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, width));
    }

    function savePanelWidth(width: number) {
        localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(clampWidth(width)));
    }

    function toggleTheme() {
        toggleThemeMode($theme);
    }

    function onSearch() {
        if ($isSharedRoute) {
            return;
        }

        $isSearchModalOpen = !$isSearchModalOpen;
    }

    function onToggleSidebar() {
        if ($isSharedRoute) {
            return;
        }

        isExpanded = !isExpanded;
    }

    function onResizeHandleMouseDown(event: MouseEvent) {
        if (!isExpanded) {
            return;
        }

        isResizing = true;
        startClientX = event.clientX;
        startPanelWidth = panelWidth;

        window.addEventListener('mousemove', onResizeMouseMove);
        window.addEventListener('mouseup', onResizeMouseUp);

        document.body.classList.add('cursor-ew-resize', 'select-none');
        event.preventDefault();
    }

    function onResizeMouseMove(event: MouseEvent) {
        if (!isResizing) {
            return;
        }

        const deltaX = event.clientX - startClientX;
        panelWidth = clampWidth(startPanelWidth + deltaX);
    }

    function onResizeMouseUp() {
        if (!isResizing) {
            return;
        }

        savePanelWidth(panelWidth);
        stopResize();
    }

    function stopResize() {
        isResizing = false;
        window.removeEventListener('mousemove', onResizeMouseMove);
        window.removeEventListener('mouseup', onResizeMouseUp);
        document.body.classList.remove('cursor-ew-resize', 'select-none');
    }

    //
    function onToggleWorkspaceSelection() {
        if ($isSharedRoute) {
            return;
        }

        $isWorkspaceSelectionOpen = !$isWorkspaceSelectionOpen;
    }

    //
    function onOpenWorkspaceSettings() {
        if (!workspaceSettingsPath) {
            return;
        }

        window.location.assign(workspaceSettingsPath);
    }

    function onHelpMaterials() {
        window.location.assign("/help-materials")
    }

    async function onUserProfile() {
        await goto("/userprofile")
    }
    
    function onKeyDownWindow(ev: KeyboardEvent) {
        if ($isSharedRoute) {
            return;
        }

        if (ev.ctrlKey && ev.key === '.') {
            isExpanded = !isExpanded;
        }

        if (ev.ctrlKey && ev.key === 'p') {
            ev.preventDefault();
            onSearch();
        }
    }
</script>

<svelte:window 
    onkeydown={onKeyDownWindow}
/>

<aside 
    class="relative flex h-full flex-col border-r border-base-300 bg-base-100 {isResizing ? '' : 'transition-all duration-300'}"
    style={`width: ${$isSharedRoute ? COLLAPSED_WIDTH : isExpanded ? panelWidth + COLLAPSED_WIDTH : COLLAPSED_WIDTH}px`}
>
    <div class="flex flex-1 overflow-hidden">
        <!-- Narrow Stripe (Activity Bar) -->
        <div class="flex w-14 flex-none flex-col items-center py-4 border-r border-base-300">
            <div class="mb-4 flex flex-col items-center gap-6">
                <!-- Workspace selection -->
                <div class="tooltip tooltip-right" data-tip="{isSomeWorkspaceSelected ? $selectedWorkspace?.name : unspecifiedWorkspaceName}">
                    {#if $isSharedRoute}
                        <div
                            class="flex h-10 w-10 p-2 items-center justify-center rounded-xl bg-primary/10"
                            aria-label="Shared workspace"
                        >
                            <UI.Workspace.WorkspaceProfile
                                imageUrl={$selectedWorkspace?.imageUrl}
                                workspaceName={$selectedWorkspace?.name ?? ""}
                            />
                        </div>
                    {:else}
                        <button 
                            class="flex h-10 w-10 p-2 items-center justify-center rounded-xl bg-primary/10 transition-all hover:scale-105 hover:bg-primary/20"
                            class:isSelected={$isWorkspaceSelectionOpen}
                            onclick={onToggleWorkspaceSelection}
                        >
                            <UI.Workspace.WorkspaceProfile
                                imageUrl={$selectedWorkspace?.imageUrl}
                                workspaceName={$selectedWorkspace?.name ?? unspecifiedWorkspaceName}
                            />
                        </button>
                    {/if}
                </div>

                <!-- Quick Actions -->
                <div class="flex flex-col items-center gap-3">
                    {#if !$isSharedRoute}
                        <div class="tooltip tooltip-right" data-tip="Search (Ctrl+P)">
                            <button
                                onclick={onSearch}
                                class="btn btn-ghost btn-square btn-sm rounded-lg text-base-content/70 hover:bg-base-300 hover:text-primary active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed {$isSearchModalOpen ? 'bg-base-100 text-primary' : 'text-base-content/70'}"
                                aria-label="Search"
                            >
                                <Icon icon="material-symbols:search-rounded" class="text-xl"/>
                            </button>
                        </div>
                        
                        <div class="tooltip tooltip-right" data-tip={isExpanded ? `Collapse Sidebar (Ctrl + .)` : 'Expand Tasks Explorer (Ctrl + .)'}>
                            <button
                                onclick={onToggleSidebar}
                                class="btn btn-ghost btn-square btn-sm rounded-lg {isExpanded ? 'bg-base-100 text-primary' : 'text-base-content/70'} hover:bg-base-300 hover:text-primary active:scale-95 transition-colors"
                                aria-label="Toggle sidebar"
                            >
                                <Icon icon="material-symbols:thumbnail-bar-outline" class="text-xl"/>
                            </button>
                        </div>
                    {/if}
                </div>
            </div>

            <div class="mt-auto flex flex-col items-center gap-4">
                <div class="tooltip tooltip-right" data-tip={$theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
                    <button
                        onclick={toggleTheme}
                        class="btn btn-ghost btn-square btn-sm relative overflow-hidden rounded-lg text-base-content/70 hover:bg-base-300 hover:text-primary active:scale-95 transition-all"
                        aria-label="Toggle theme"
                    >
                        {#if $theme === 'dark'}
                            <div class="flex items-center justify-center animate-in zoom-in-50 duration-300">
                                <Icon icon="material-symbols:wb-sunny-outline-rounded" class="text-xl"/>
                            </div>
                        {:else}
                            <div class="flex items-center justify-center animate-in zoom-in-50 duration-300">
                                <Icon icon="material-symbols:dark-mode-outline-rounded" class="text-xl"/>
                            </div>
                        {/if}
                    </button>
                </div>

                <div class="flex flex-col gap-2">
                    <div class="tooltip tooltip-right" data-tip="Help Materials">
                        <button
                            class="btn btn-ghost btn-square btn-sm relative overflow-hidden rounded-lg text-base-content/70 hover:bg-base-300 hover:text-primary active:scale-95 transition-all"
                            onclick={onHelpMaterials}
                        >
                            <Icon 
                                icon="material-symbols:help-outline-rounded"
                                class="text-xl"
                            />
                        </button>
                    </div>

                    {#if canOpenWorkspaceSettings}
                        <div class="tooltip tooltip-right" data-tip="Workspace Settings">
                            <button 
                                class="btn btn-ghost btn-square btn-sm relative overflow-hidden rounded-lg text-base-content/70 hover:bg-base-300 hover:text-primary active:scale-95 transition-all"
                                onclick={onOpenWorkspaceSettings}
                            >
                                <Icon 
                                    icon="material-symbols:settings-outline-rounded"
                                    class="text-xl"
                                />
                            </button>
                        </div>
                    {/if}
                </div>

                {#if $user}
                    <div 
                        class="tooltip tooltip-right"
                        data-tip="{$user.name} ({$user.email})"
                    >
                        <button
                            class="avatar placeholder group cursor-pointer transition-all hover:scale-105 active:scale-95"
                            onclick={onUserProfile}
                        >
                            <UI.Common.AvatarComponent.ProfileAvatar
                                name={$user.name}
                                profileImgURL={$user.profileImgURL}
                            />
                        </button>
                    </div>
                {/if}
            </div>
        </div>

        <!-- Expansion Panel (Explorer) -->
        {#if !$isSharedRoute}
            <ExpansionPanel 
                {isExpanded}
            />
        {/if}

        {#if !$isSharedRoute && isExpanded}
            <div
                class="absolute right-0 top-0 z-20 h-full w-1.5 cursor-ew-resize transition-colors {isResizing || isResizeHandleHovered ? 'bg-primary/50' : 'bg-transparent hover:bg-primary/30'}"
                onmouseenter={() => {
                    isResizeHandleHovered = true;
                }}
                onmouseleave={() => {
                    isResizeHandleHovered = false;
                }}
                onmousedown={onResizeHandleMouseDown}
                role="presentation"
            ></div>
        {/if}
    </div>
</aside>

<style>
    .isSelected {
        transform: scale(1.15);
        background-color: rgba(33, 83, 235, 0.4);
    }
</style>
