<script lang="ts">
    import { browser } from '$app/environment';
    import Icon from '@iconify/svelte';
    import type { AIPoint, ContextSpecificationPayload, PlayMode } from '../../types/AIList';
    import { play, stopPlaying } from '$lib/playMode';
    import { playMode, selectedFile, selectedTools } from '$lib/stores/files';
    import { selectedModel } from '$lib/stores/files';
    import type { AI } from '@ravenlens/shared';
    import { selectedMcpServers } from '$lib/stores/mcpConfig';
    import { contextSpecification } from '$lib/stores/contextSpec';
    import { isPlayingItems } from '$lib/stores/playMode';
    import { editor } from '$lib/stores/editor';
    import ContextSelectionModal from '$lib/modals/ContextSelectionModal.svelte';
    import PlayModeDropdownContent from '$lib/components/PlayModeDropdownContent.svelte';

    let {
        visible = false,
        itemId,
        aiAnswers,
        onDeletePoint
    }: {
        visible?: boolean,
        itemId: string,
        aiAnswers: AIPoint["aiAnswers"] | null,
        onDeletePoint?: () => void
    } = $props();

    const POINT_CONTEXT_STORAGE_KEY_PREFIX = 'ravenone:point-context:';

    // Setup Local Item state
    const selectedItemModel = $state<AI.RavenLensAvaiableAIModel | undefined>($selectedModel);
    let selectedItemPlayMode = $state<PlayMode>($playMode);
    const availableItemTools = $state($selectedTools);
    const selectedItemMcpServers = $state($selectedMcpServers);
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
        isPointPlayModeModalOpen = false;
        pointPlayModeDropdownPosition = null;
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

    function onDeletePointClick(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        closePointActionsDropdown();
        if (browser) {
            localStorage.removeItem(getPointContextStorageKey(itemId));
        }

        onDeletePoint?.();
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

    /** Play Mode */
    async function onPlay(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        if (!$selectedFile) {
            // FIXME: Add alert
            return;
        }

        //
        if (!selectedItemModel) {
            // FIXME: Add alert
            return;
        }

        //
        if (!availableItemTools) {
            // FIXME: Add alert
            return;
        }

        if (isPlayingItems.isItemPlaying(itemId)) {
            try {
                await stopPlaying({
                    fileId: $selectedFile.id,
                    itemId
                });
            } finally {
                isPlayingItems.unsetItemPlaying(itemId);
            }

            return;
        }

        const hasSetState = isPlayingItems.setUpItemPlaying(itemId);
        if (!hasSetState) {
            return;
        }

        // Plays for specific item since `itemId` property is specified
        try {
            await play({
                document: {
                    ...$selectedFile,
                    content: $editor?.getHTML() ?? $selectedFile.content ?? ''
                },
                itemId,
                mode: selectedItemPlayMode,
                model: selectedItemModel,
                tools: availableItemTools,
                mcpServers: selectedItemMcpServers,
                contextSpec: getEffectivePointContextPayload()
            });
        } catch {
            isPlayingItems.unsetItemPlaying(itemId);
        }
    }

    async function onStop(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        if (!$selectedFile) {
            isPlayingItems.unsetItemPlaying(itemId);
            return;
        }

        try {
            await stopPlaying({
                fileId: $selectedFile.id,
                itemId
            });
        } finally {
            isPlayingItems.unsetItemPlaying(itemId);
        }
    }
</script>

<svelte:window onclick={onWindowClick} />

<div
    class="list-item-hover-actions absolute left-[-3rem] top-[-2rem] z-[70] flex items-center gap-1 rounded-md border border-base-300 bg-base-100 px-1 py-0.5 shadow-md transition-opacity duration-150 {visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}"
    contenteditable="false"
>
    <!-- Playing the specific element TODO: Show the possible modes -->
    {#key $isPlayingItems}
        {#if isPlayingItems.isItemPlaying(itemId)}
            <button 
                type="button"
                class="btn btn-ghost btn-xs min-h-0 h-6 w-6 p-0 text-base-content/70 hover:text-base-content"
                aria-label="Stop action"
                onclick={onStop}
            >
                <Icon icon="mdi:stop" width="14" height="14" />
            </button>
        {:else}
            <button 
                type="button"
                class="play-point btn btn-ghost btn-xs min-h-0 h-6 w-6 p-0 text-base-content/70 hover:text-base-content"
                aria-label="Run action"
                onclick={onPlay}
                oncontextmenu={onOpenPointPlayModeModal}
            >
                <Icon icon="mdi:play" width="14" height="14" />
            </button>
        {/if}
    {/key}

    <!-- Context addition to the specific element -->
    <button type="button" class="btn btn-ghost btn-xs min-h-0 h-6 w-6 p-0 text-base-content/70 hover:text-base-content" aria-label="Comment action" onclick={onOpenPointContextModal}>
        <Icon icon="mdi:message-text-outline" width="14" height="14" />
    </button>
    
    <!-- TODO: Connect the plugins for playing -->
    <!-- <button type="button" class="btn btn-ghost btn-xs min-h-0 h-6 w-6 p-0 text-base-content/70 hover:text-base-content" aria-label="Extension action">
        <Icon icon="mdi:puzzle-outline" width="14" height="14" />
    </button> -->
    
    <!-- TODO: Display the options e.g: remove the point with answers -->
    <button type="button" class="btn btn-ghost btn-xs min-h-0 h-6 w-6 p-0 text-base-content/70 hover:text-base-content" aria-label="Menu action" onclick={onOpenPointActionsMenu}>
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
            contenteditable="false"
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
            contenteditable="false"
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
                <button
                    type="button"
                    class="delete-btn btn btn-ghost w-full btn-sm justify-start gap-2"
                    aria-label="Delete point"
                    onclick={onDeletePointClick}
                >
                    <Icon icon="mdi:trash-can-outline" width="16" height="16" />
                    <span>Clear Content</span>
                </button>
            </div>
        </div>
    {/if}
{/if}