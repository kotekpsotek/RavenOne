<script lang="ts">
    import { NodeViewWrapper, NodeViewContent } from 'svelte-tiptap';
    import type { NodeViewProps } from '@tiptap/core';

    let { node, updateAttributes }: NodeViewProps = $props();

    function handleChange(event: Event) {
        const target = event.target as HTMLInputElement;
        updateAttributes({ checked: target.checked });
    }
</script>

<NodeViewWrapper
    as="li"
    class="custom-standard-task-item"
    style="list-style-type: none; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; column-gap: 0.5rem;"
    data-type="standardTaskItem"
    data-checked={node.attrs.checked}
>
    <label
        class="cursor-pointer flex items-start justify-center"
        style="display: flex; align-items: flex-start; justify-content: center; grid-column: 1; padding-top: 0.15rem;"
    >
        <input
            type="checkbox"
            class="checkbox checkbox-sm checkbox-primary"
            checked={node.attrs.checked}
            onchange={handleChange}
        />
    </label>

    <div style="grid-column: 2; min-width: 0;">
        <NodeViewContent as="div" style="min-height: 1.5rem; width: 100%; display: block;" />
    </div>
</NodeViewWrapper>
