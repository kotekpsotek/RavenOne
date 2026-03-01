<script lang="ts">
    import Icon from '@iconify/svelte';
    import type { AIPoint, PlayMode } from '../../types/AIList';
    import { play } from '$lib/playMode';
    import { playMode, selectedFile, selectedTools } from '$lib/stores/files';
    import { selectedModel } from '$lib/stores/files';
    import type { AI } from '@ravenlens/shared';
    import { selectedMcpServers } from '$lib/stores/mcpConfig';
    import { contextSpecification } from '$lib/stores/contextSpec';
    import { isPlayingItems } from '$lib/stores/playMode';

    let { visible = false, itemId, aiAnswers }: { visible?: boolean, itemId: string, aiAnswers: AIPoint["aiAnswers"] | null } = $props();

    // Setup Local Item state
    const selectedItemModel = $state<AI.RavenLensAvaiableAIModel | undefined>($selectedModel);
    const selectedItemPlayMode = $state<PlayMode>($playMode);
    const availableItemTools = $state($selectedTools);
    const selectedItemMcpServers = $state($selectedMcpServers);
    const contextItemSpec = $state($contextSpecification);

    /** Play Mode */
    // TODO: Handle the Play according to selected playmode where it's one of type for `PlayMode`
    // TODO: Add backend socket.io server handling for onPlay
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

        const hasSetState = isPlayingItems.setUpItemPlaying(itemId);
        if (!hasSetState) {
            return;
        }

        // Plays for specific item since `itemId` property is specified
        try {
            await play({
                document: $selectedFile,
                itemId,
                mode: selectedItemPlayMode,
                model: selectedItemModel,
                tools: availableItemTools,
                mcpServers: selectedItemMcpServers,
                contextSpec: contextItemSpec
            });
        } finally {
            isPlayingItems.unsetItemPlaying(itemId);
        }
    }

    function onStop(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        isPlayingItems.unsetItemPlaying(itemId);
    }
</script>

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
                class="btn btn-ghost btn-xs min-h-0 h-6 w-6 p-0 text-base-content/70 hover:text-base-content"
                aria-label="Run action"
                onclick={onPlay}
            >
                <Icon icon="mdi:play" width="14" height="14" />
            </button>
        {/if}
    {/key}

    <!-- Context addition to the specific element -->
    <button type="button" class="btn btn-ghost btn-xs min-h-0 h-6 w-6 p-0 text-base-content/70 hover:text-base-content" aria-label="Comment action">
        <Icon icon="mdi:message-text-outline" width="14" height="14" />
    </button>
    
    <!-- TODO: Connect the plugins for playing -->
    <!-- <button type="button" class="btn btn-ghost btn-xs min-h-0 h-6 w-6 p-0 text-base-content/70 hover:text-base-content" aria-label="Extension action">
        <Icon icon="mdi:puzzle-outline" width="14" height="14" />
    </button> -->
    
    <!-- TODO: Display the options e.g: remove the point with answers -->
    <button type="button" class="btn btn-ghost btn-xs min-h-0 h-6 w-6 p-0 text-base-content/70 hover:text-base-content" aria-label="Menu action">
        <Icon icon="mdi:menu" width="14" height="14" />
    </button>
</div>