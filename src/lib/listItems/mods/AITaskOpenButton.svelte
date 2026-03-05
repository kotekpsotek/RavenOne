<script lang="ts">
    import { clickedListItemId } from '$lib/stores/hoveredListItem';
    import Icon from '@iconify/svelte';

    let { itemId, onmouseenter, onmouseleave }: { itemId: string, onmouseenter: () => any, onmouseleave: () => any } = $props();
</script>

<svelte:window
    onclick={() => {
        $clickedListItemId = null;
    }}
/>

<button
    class="text-gray-400 p-1 rounded-lg {$clickedListItemId === itemId ? 'bg-base-300' : ''}"
    onclick={clickedListItemId.handleMouseMenuClick(itemId)}
    {onmouseenter}
    {onmouseleave}
>
    <Icon icon="material-symbols:menu-rounded" />
</button>