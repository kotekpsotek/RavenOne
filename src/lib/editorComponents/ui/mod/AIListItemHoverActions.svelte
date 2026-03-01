<script lang="ts">
    import Icon from '@iconify/svelte';
    import type { AIPoint } from '../../types/AIList';

    let { visible = false, itemId, aiAnswers }: { visible?: boolean, itemId: string, aiAnswers: AIPoint["aiAnswers"] | null } = $props();
</script>

<div
    class="list-item-hover-actions absolute left-[-3rem] top-[-2rem] z-[70] flex items-center gap-1 rounded-md border border-base-300 bg-base-100 px-1 py-0.5 shadow-md transition-opacity duration-150 {visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}"
    contenteditable="false"
>
    <!-- Playing the specific element TODO: Show the possible modes -->
    <button type="button" class="btn btn-ghost btn-xs min-h-0 h-6 w-6 p-0 text-base-content/70 hover:text-base-content" aria-label="Run action">
        <Icon icon="mdi:play" width="14" height="14" />
    </button>

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