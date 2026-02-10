<script lang="ts">
  import { NodeViewWrapper, NodeViewContent } from 'svelte-tiptap';
  import Icon from '@iconify/svelte';
  import { untrack } from 'svelte';

  interface Props {
      node: any;
      updateAttributes: (attrs: any) => void;
  }
  
  let { node, updateAttributes }: Props = $props();
  
  // Local state
  const initialChecked = untrack(() => node.attrs.checked) || false;
  let checked = $state(initialChecked);

  // Sync from props
  $effect(() => {
     if (node.attrs.checked !== checked) checked = node.attrs.checked;
  });

  function toggle() {
    checked = !checked;
    updateAttributes({ checked });
  }
</script>

<NodeViewWrapper class="flex items-start gap-3 my-2 group">
  <button 
    class="mt-1 flex-shrink-0 w-5 h-5 border-2 border-base-content/30 rounded flex items-center justify-center transition-colors hover:border-primary"
    class:bg-primary={checked}
    class:border-primary={checked}
    onclick={toggle}
    contenteditable="false"
  >
    {#if checked}
      <Icon icon="material-symbols:check" class="text-white w-3 h-3" />
    {/if}
  </button>
  
  <div class="flex-1 min-w-0" class:line-through={checked} class:opacity-50={checked}>
    <NodeViewContent />
  </div>
  
  <!-- Visual indicator if it's an AI task -->
  <div class="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-secondary font-mono bg-secondary/10 px-1 rounded" contenteditable="false">
    AI Task
  </div>
</NodeViewWrapper>
