<script lang="ts">
    import { NodeViewWrapper, NodeViewContent } from 'svelte-tiptap';
    import type { NodeViewProps } from '@tiptap/core';

    let { node, updateAttributes, extension }: NodeViewProps = $props();
</script>

<NodeViewWrapper as="div" class="custom-ordered-list-wrapper my-2">
    <NodeViewContent as="ol" class="list-decimal pl-5" />
</NodeViewWrapper>
