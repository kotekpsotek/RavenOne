<script lang="ts">
    import Icon from "@iconify/svelte";
    import { onMount } from 'svelte';
    import { user } from "../stores/user";
    import { UI } from "@ravenlens/frontend"
    import { theme } from "../stores/theme";
    import { goto } from "$app/navigation";
    import ExpansionPanel from "./ExpansionPanel.svelte";
    import { isWorkspaceSelectionOpen, selectedWorkspace } from "$lib/stores/workspace";
    import { isSearchModalOpen } from "$lib/stores/files";

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

    onMount(() => {
        const storedTheme = localStorage.getItem('theme') as 'dark' | 'light';
        if (storedTheme) {
            $theme = storedTheme;
        } else {
            const hasdarkAttr = document.documentElement.getAttribute('data-theme') === 'black';
            $theme = hasdarkAttr ? 'dark' : 'light';
        }
        
        applyTheme();

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
        $theme = $theme === 'dark' ? 'light' : 'dark';
        applyTheme();
    }

    function applyTheme() {
        // Set the primary theme attribute used by DaisyUI
        const daisyTheme = $theme === 'dark' ? 'black' : 'light';
        document.documentElement.setAttribute('data-theme', daisyTheme);
        localStorage.setItem('theme', $theme);
        
        if ($theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }

    function onSearch() {
        $isSearchModalOpen = !$isSearchModalOpen;
    }

    function onToggleSidebar() {
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
        $isWorkspaceSelectionOpen = !$isWorkspaceSelectionOpen;
    }

    //
    async function onOpenWorkspaceSettings() {
        window.location.assign("/workspace-settings/common");
    }

    function onHelpMaterials() {
        window.location.assign("/help-materials")
    }

    async function onUserProfile() {
        await goto("/userprofile")
    }
    
    function onKeyDownWindow(ev: KeyboardEvent) {
        if (ev.ctrlKey && ev.key === 'b') {
            isExpanded = !isExpanded;
        }
    }
</script>

<svelte:window 
    onkeydown={onKeyDownWindow}
/>

<aside 
    class="relative flex h-full flex-col border-r border-base-300 bg-base-100 {isResizing ? '' : 'transition-all duration-300'}"
    style={`width: ${isExpanded ? panelWidth + COLLAPSED_WIDTH : COLLAPSED_WIDTH}px`}
>
    <div class="flex flex-1 overflow-hidden">
        <!-- Narrow Stripe (Activity Bar) -->
        <div class="flex w-14 flex-none flex-col items-center py-4 border-r border-base-300">
            <div class="mb-4 flex flex-col items-center gap-6">
                <!-- Workspace selection -->
                <div class="tooltip tooltip-right" data-tip="RavenOne">
                    <button 
                        class="flex h-10 w-10 p-2 items-center justify-center rounded-xl bg-primary/10 transition-all hover:scale-105 hover:bg-primary/20"
                        class:isSelected={$isWorkspaceSelectionOpen}
                        onclick={onToggleWorkspaceSelection}
                    >
                        <UI.Workspace.WorkspaceProfile
                            imageUrl={$selectedWorkspace?.imageUrl}
                            workspaceName={$selectedWorkspace?.name ?? ""}
                        />
                    </button>
                </div>

                <!-- Quick Actions -->
                <div class="flex flex-col items-center gap-3">
                    <div class="tooltip tooltip-right" data-tip="Search (Ctrl+P)">
                        <button
                            onclick={onSearch}
                            class="btn btn-ghost btn-square btn-sm rounded-lg text-base-content/70 hover:bg-base-300 hover:text-primary active:scale-95 {$isSearchModalOpen ? 'bg-base-100 text-primary' : 'text-base-content/70'}"
                            aria-label="Search"
                        >
                            <Icon icon="material-symbols:search-rounded" class="text-xl"/>
                        </button>
                    </div>
                    
                    <div class="tooltip tooltip-right" data-tip={isExpanded ? `Collapse Sidebar (CTRL + B)` : 'Expand Tasks Explorer (CTRL + B)'}>
                        <button
                            onclick={onToggleSidebar}
                            class="btn btn-ghost btn-square btn-sm rounded-lg {isExpanded ? 'bg-base-100 text-primary' : 'text-base-content/70'} hover:bg-base-300 hover:text-primary active:scale-95 transition-colors"
                            aria-label="Toggle sidebar"
                        >
                            <Icon icon="material-symbols:thumbnail-bar-outline" class="text-xl"/>
                        </button>
                    </div>
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
                            <div class="w-10 rounded-xl bg-neutral text-neutral-content ring-primary/30 ring-offset-base-200 transition-all group-hover:ring group-hover:ring-offset-2">
                                <img src="{$user.profileImgURL}" alt="{$user.name}" />
                            </div>
                        </button>
                    </div>
                {/if}
            </div>
        </div>

        <!-- Expansion Panel (Explorer) -->
        <ExpansionPanel 
            {isExpanded}
        />

        {#if isExpanded}
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
    @reference "../../app.css";

    .isSelected {
        @apply scale-115 bg-primary/40;
    }
</style>
