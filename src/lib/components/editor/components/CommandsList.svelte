<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '@iconify/svelte';

  interface Props {
      items: any[];
      command: (item: any) => void;
  }
  
  let { items, command }: Props = $props();
  
  let selectedIndex = $state(0);
  let container: HTMLElement;

  export function onKeyDown({ event }: { event: KeyboardEvent }) {
    if (event.key === 'ArrowUp') {
      upHandler();
      return true;
    }
    if (event.key === 'ArrowDown') {
      downHandler();
      return true;
    }
    if (event.key === 'Enter') {
      enterHandler();
      return true;
    }
    return false;
  }

  function upHandler() {
    selectedIndex = (selectedIndex + items.length - 1) % items.length;
    scrollSelectedIntoView();
  }

  function downHandler() {
    selectedIndex = (selectedIndex + 1) % items.length;
    scrollSelectedIntoView();
  }

  function enterHandler() {
    selectItem(selectedIndex);
  }

  function selectItem(index: number) {
    const item = items[index];
    if (item) {
      command(item);
    }
  }
  
  function scrollSelectedIntoView() {
      // microtask to wait for DOM update
      setTimeout(() => {
          if (!container) return;
          const selected = container.children[selectedIndex] as HTMLElement;
          if (selected) {
              selected.scrollIntoView({ block: 'nearest' });
          }
      }, 0);
  }

  $effect(() => {
      // Reset selection when items change
      if (items) selectedIndex = 0;
  });
</script>

<div 
  class="z-50 min-w-[300px] h-auto max-h-[330px] overflow-auto rounded-lg border border-base-300 bg-base-100 shadow-xl p-1"
  bind:this={container}
>
  {#if items.length}
    {#each items as item, index}
      <button
        class="w-full flex items-center gap-2 p-2 rounded text-sm text-left transition-colors"
        class:bg-base-200={index === selectedIndex}
        class:text-primary={index === selectedIndex}
        onclick={() => selectItem(index)}
      >
        <div class="flex items-center justify-center h-8 w-8 rounded border border-base-200 bg-base-100">
             {#if item.icon}
                <Icon icon={item.icon} class="w-4 h-4" />
             {/if}
        </div>
        <div class="flex flex-col">
          <span class="font-medium">{item.title}</span>
          {#if item.description}
             <span class="text-xs text-base-content/50">{item.description}</span>
          {/if}
        </div>
      </button>
    {/each}
  {:else}
    <div class="p-2 text-sm text-base-content/50">No results</div>
  {/if}
</div>
