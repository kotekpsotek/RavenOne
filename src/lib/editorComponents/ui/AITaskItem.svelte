<script lang="ts">
    import { NodeViewWrapper, NodeViewContent } from 'svelte-tiptap';
    import type { NodeViewProps } from '@tiptap/core';
    import { v4 as uuidv4 } from 'uuid';
    import ListItemHoverActions from './AIListItemHoverActions.svelte';
    import { hoveredListItemId } from '../../stores/hoveredListItem';
    import { getAIAnswers } from '../types/AIList';

    let { node, updateAttributes, extension }: NodeViewProps = $props();
    const itemId = `task-${uuidv4()}`;
    const aiAnswers = $derived(getAIAnswers(node["attrs"]["aiAnswers"]));

    function handleChange(event: Event) {
        const target = event.target as HTMLInputElement;
        updateAttributes({ checked: target.checked });
    }

    function handleMouseEnter() {
        hoveredListItemId.set(itemId);
    }

    function handleMouseLeave() {
        hoveredListItemId.update((current) => (current === itemId ? null : current));
    }
</script>

<NodeViewWrapper 
    as="li" 
    class="custom-task-item flex items-start gap-2 my-1 relative"
    data-type="taskItem"
    data-checked={node.attrs.checked}
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
>
    <ListItemHoverActions
        visible={$hoveredListItemId === itemId}
        {itemId}
        {aiAnswers}
    />
    <label class="flex items-center mt-1 cursor-pointer">
        <input 
            type="checkbox" 
            class="checkbox checkbox-sm checkbox-primary" 
            checked={node.attrs.checked} 
            onchange={handleChange} 
        />
    </label>
    <NodeViewContent as="div" class="flex-1" />
</NodeViewWrapper>
