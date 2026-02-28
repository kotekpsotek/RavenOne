<script lang="ts">
    import { NodeViewWrapper, NodeViewContent } from 'svelte-tiptap';
    import type { NodeViewProps } from '@tiptap/core';
    import { v4 as uuidv4 } from 'uuid';
    import ListItemHoverActions from './AIListItemHoverActions.svelte';
    import { hoveredListItemId, mouseOutTimeout } from '../../stores/hoveredListItem';

    let { node, updateAttributes, extension }: NodeViewProps = $props();
    const itemId = `list-${uuidv4()}`;

    function handleMouseEnter() {
        mouseOutTimeout.clearTimeout();
        hoveredListItemId.set(itemId);
    }

    function handleMouseLeave() {
        mouseOutTimeout.setTimeout();
    }
</script>

<NodeViewWrapper
    as="li"
    class="custom-list-item my-1 relative"
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
>
    <ListItemHoverActions 
        visible={$hoveredListItemId === itemId}
        {itemId}
    />
    <NodeViewContent as="div" class="w-full" />
</NodeViewWrapper>
