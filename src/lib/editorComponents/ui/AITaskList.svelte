<script lang="ts">
    import { NodeViewWrapper, NodeViewContent } from 'svelte-tiptap';
    import type { NodeViewProps } from '@tiptap/core';

    let { node, updateAttributes, extension }: NodeViewProps = $props();
</script>

<NodeViewWrapper as="div" class="custom-task-list-wrapper my-2">
    <NodeViewContent as="ul" class="list-none pl-0" data-type="taskList" />
</NodeViewWrapper>
