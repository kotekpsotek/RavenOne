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
    style="list-style-type: none; display: flex; align-items: center; justify-content: flex-start; gap: 0.5rem;"
    data-type="standardTaskItem"
    data-checked={node.attrs.checked}
>
    <label class="cursor-pointer h-full flex items-center justify-center" style="display: flex; align-items: center; flex: 0 0 auto;">
        <input
            type="checkbox"
            class="checkbox checkbox-sm checkbox-primary"
            checked={node.attrs.checked}
            onchange={handleChange}
        />
    </label>

    <div style="flex: 1 1 0%; min-width: 0; display: flex; align-items: center;">
        <NodeViewContent as="div" style="min-height: 1.5rem; width: 100%;" />
    </div>
</NodeViewWrapper>
