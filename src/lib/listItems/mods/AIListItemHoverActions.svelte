<script lang="ts">
    import { browser } from '$app/environment';
    import Icon from '@iconify/svelte';
    import type { ContextSpecificationPayload, PlayMode } from '$lib/editorComponents/types/AIList';
    import type { AI } from '@ravenlens/shared';
    import { playMode, selectedFile, selectedModel, selectedTools } from '$lib/stores/files';
    import { selectedMcpServers } from '$lib/stores/mcpConfig';
    import { contextSpecification } from '$lib/stores/contextSpec';
    import ContextSelectionModal from '$lib/modals/ContextSelectionModal.svelte';
    import PlayModeDropdownContent from '$lib/components/PlayModeDropdownContent.svelte';

    let {
        visible = false,
        itemId,
        isPointPlaying = false,
        isPointPlayable = true,
        onPlay,
        onStop,
        onClearContent,
        selectedItemModel = $bindable($selectedModel),
        availableItemTools = $bindable($selectedTools),
        selectedItemMcpServers = $bindable($selectedMcpServers),
        selectedItemPlayMode = $bindable($playMode),
        playDisabledReason
    }: {
        visible?: boolean;
        itemId: string;
        isPointPlaying?: boolean;
        isPointPlayable?: boolean;
        onPlay?: (
            pointId: string,
            config: {
                mode: PlayMode;
                model: AI.RavenLensAvaiableAIModel;
                tools: string[];
                mcpServers: string[];
                contextSpec: ContextSpecificationPayload;
            }
        ) => void | Promise<void>;
        onStop?: (pointId: string) => void | Promise<void>;
        onClearContent?: () => void;
        selectedItemModel: AI.RavenLensAvaiableAIModel | undefined;
        availableItemTools: string[],
        selectedItemMcpServers: string[],
        selectedItemPlayMode: PlayMode,
        playDisabledReason: string
    } = $props();

    const POINT_CONTEXT_STORAGE_KEY_PREFIX = 'ravenone:point-context:';

    let isPointContextModalOpen = $state(false);
    let isPointPlayModeModalOpen = $state(false);
    let pointPlayModeDropdownPosition = $state<{ x: number; y: number } | null>(null);
    let isPointActionsMenuOpen = $state(false);
    let pointActionsDropdownPosition = $state<{ x: number; y: number } | null>(null);
    let pointContextSpecDraft = $state<ContextSpecificationPayload>({
        desktopFiles: [],
        editorFiles: [],
        networkUrls: []
    });

    function getPointContextStorageKey(currentItemId: string) {
        return `${POINT_CONTEXT_STORAGE_KEY_PREFIX}${currentItemId}`;
    }

    function cloneContextPayload(payload: ContextSpecificationPayload): ContextSpecificationPayload {
        return {
            desktopFiles: [...payload.desktopFiles],
            editorFiles: [...payload.editorFiles],
            networkUrls: [...payload.networkUrls]
        };
    }

    function isContextSpecificationPayload(value: unknown): value is ContextSpecificationPayload {
        return Boolean(
            value &&
            typeof value === 'object' &&
            Array.isArray((value as ContextSpecificationPayload).desktopFiles) &&
            Array.isArray((value as ContextSpecificationPayload).editorFiles) &&
            Array.isArray((value as ContextSpecificationPayload).networkUrls)
        );
    }

    function readPointContextPayload(currentItemId: string): ContextSpecificationPayload | null {
        if (!browser) {
            return null;
        }

        const rawPayload = localStorage.getItem(getPointContextStorageKey(currentItemId));
        if (!rawPayload) {
            return null;
        }

        try {
            const parsedPayload = JSON.parse(rawPayload) as unknown;

            if (isContextSpecificationPayload(parsedPayload)) {
                return cloneContextPayload(parsedPayload);
            }
        } catch (error) {
            console.error(error);
        }

        return null;
    }

    function getEffectivePointContextPayload() {
        return readPointContextPayload(itemId) ?? cloneContextPayload($contextSpecification);
    }

    function onOpenPointContextModal(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        pointContextSpecDraft = getEffectivePointContextPayload();
        isPointContextModalOpen = true;
    }

    function onSavePointContext(payload: ContextSpecificationPayload) {
        pointContextSpecDraft = cloneContextPayload(payload);

        if (browser) {
            localStorage.setItem(getPointContextStorageKey(itemId), JSON.stringify(pointContextSpecDraft));
        }

        isPointContextModalOpen = false;
    }

    function onOpenPointPlayModeModal(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        closePointActionsDropdown();
        pointPlayModeDropdownPosition = {
            x: event.clientX,
            y: event.clientY
        };
        isPointPlayModeModalOpen = true;
    }

    function onSavePointPlayMode(mode: PlayMode) {
        selectedItemPlayMode = mode;
        closePointPlayModeDropdown();
    }

    function closePointPlayModeDropdown() {
        isPointPlayModeModalOpen = false;
        pointPlayModeDropdownPosition = null;
    }

    function onOpenPointActionsMenu(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        closePointPlayModeDropdown();
        pointActionsDropdownPosition = {
            x: event.clientX,
            y: event.clientY
        };
        isPointActionsMenuOpen = true;
    }

    function closePointActionsDropdown() {
        isPointActionsMenuOpen = false;
        pointActionsDropdownPosition = null;
    }

    function onWindowClick(event: MouseEvent) {
        if (!isPointPlayModeModalOpen && !isPointActionsMenuOpen) {
            return;
        }

        const target = event.target as HTMLElement | null;
        if (target?.closest('.point-play-settings-dropdown') || target?.closest('.point-actions-dropdown')) {
            return;
        }

        closePointPlayModeDropdown();
        closePointActionsDropdown();
    }

    async function onPlayClick(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        if (!isPointPlayable || !$selectedFile || !selectedItemModel) {
            return;
        }

        await onPlay?.(itemId, {
            mode: selectedItemPlayMode,
            model: selectedItemModel,
            tools: availableItemTools,
            mcpServers: selectedItemMcpServers,
            contextSpec: getEffectivePointContextPayload()
        });
    }

    async function onStopClick(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        await onStop?.(itemId);
    }

    function onDeletePointClick(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        closePointActionsDropdown();

        if (browser) {
            localStorage.removeItem(getPointContextStorageKey(itemId));
        }

        onClearContent?.();
    }
</script>

<svelte:window onclick={onWindowClick} />

<div
    class="list-item-hover-actions absolute left-[-2rem] top-[-2rem] z-[70] flex items-center gap-1 rounded-md border border-base-300 bg-base-100 px-1 py-0.5 shadow-md transition-opacity duration-150 {visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}"
>
    {#if isPointPlaying}
        <button
            type="button"
            class="btn btn-ghost btn-xs min-h-0 h-6 w-6 p-0 text-base-content/70 hover:text-base-content"
            aria-label="Stop action"
            onclick={onStopClick}
        >
            <Icon icon="mdi:stop" width="14" height="14" />
        </button>
    {:else}
        <div
            class="h-full w-fit flex items-center justify-center"
            title={playDisabledReason || "Click right-mouse to check the possible modes"}
        >
            <button
                type="button"
                class="play-point btn btn-ghost btn-xs min-h-0 h-6 w-6 p-0 text-base-content/70 hover:text-base-content"
                aria-label="Run action"
                disabled={!isPointPlayable}
                onclick={onPlayClick}
                oncontextmenu={onOpenPointPlayModeModal}
            >
                <Icon icon="mdi:play" width="14" height="14" />
            </button>
        </div>
    {/if}

    <button
        type="button"
        class="btn btn-ghost btn-xs min-h-0 h-6 w-6 p-0 text-base-content/70 hover:text-base-content"
        aria-label="Selection modes"
        title="Show possible modes"
        disabled={isPointPlaying}
        onclick={onOpenPointPlayModeModal}
    >
        <Icon icon="mdi:tune-variant" width="14" height="14" />
    </button>

    <button
        type="button"
        class="btn btn-ghost btn-xs min-h-0 h-6 w-6 p-0 text-base-content/70 hover:text-base-content"
        aria-label="Action Context"
        disabled={isPointPlaying}
        onclick={onOpenPointContextModal}
    >
        <Icon icon="material-symbols:note-stack-outline-rounded" width="14" height="14" />
    </button>

    <button
        type="button"
        class="btn btn-ghost btn-xs min-h-0 h-6 w-6 p-0 text-base-content/70 hover:text-base-content"
        aria-label="Menu action"
        onclick={onOpenPointActionsMenu}
    >
        <Icon icon="mdi:menu" width="14" height="14" />
    </button>
</div>

{#if isPointContextModalOpen}
    <ContextSelectionModal
        bind:open={isPointContextModalOpen}
        contextPayload={pointContextSpecDraft}
        onSave={onSavePointContext}
        infoMessage="You can specify the independent context only for this point"
    />
{/if}

{#if isPointPlayModeModalOpen}
    {#if pointPlayModeDropdownPosition}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="point-play-settings-dropdown dropdown dropdown-open fixed z-[80]"
            style={`left: ${pointPlayModeDropdownPosition.x}px; top: ${pointPlayModeDropdownPosition.y}px;`}
            onclick={(event) => {
                event.preventDefault();
                event.stopPropagation();
            }}
            onmousedown={(event) => {
                event.preventDefault();
                event.stopPropagation();
            }}
            oncontextmenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
            }}
        >
            <div class="dropdown-content z-[80]">
                <PlayModeDropdownContent
                    selectedPlayMode={selectedItemPlayMode}
                    onSelect={onSavePointPlayMode}
                />
            </div>
        </div>
    {/if}
{/if}

{#if isPointActionsMenuOpen}
    {#if pointActionsDropdownPosition}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="point-actions-dropdown dropdown dropdown-open fixed z-[80]"
            style={`left: ${pointActionsDropdownPosition.x}px; top: ${pointActionsDropdownPosition.y}px;`}
            onclick={(event) => {
                event.preventDefault();
                event.stopPropagation();
            }}
            oncontextmenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
            }}
        >
            <div class="dropdown-content z-[80] min-w-40 rounded-box border border-base-300 bg-base-100 p-1 shadow-md">
                <div title={isPointPlaying ? 'Cannot clear content of playing point' : ''}>
                    <button
                        type="button"
                        class="delete-btn btn btn-ghost w-full btn-sm justify-start gap-2"
                        aria-label="Delete point"
                        disabled={isPointPlaying}
                        onclick={onDeletePointClick}
                    >
                        <Icon icon="mdi:trash-can-outline" width="16" height="16" />
                        <span>Clear Content</span>
                    </button>
                </div>
            </div>
        </div>
    {/if}
{/if}