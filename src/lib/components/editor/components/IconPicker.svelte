<script lang="ts">
  import Icon from '@iconify/svelte';
  
  interface Props {
      onSelect: (icon: string) => void;
      onClose: () => void;
      targetElement?: HTMLElement;
  }
  
  let { onSelect, onClose }: Props = $props();

  const commonIcons = [
      'material-symbols:article',
      'material-symbols:book',
      'material-symbols:folder',
      'material-symbols:home',
      'material-symbols:star',
      'material-symbols:schedule',
      'material-symbols:check-circle',
      'material-symbols:settings', 
      'material-symbols:person',
      'material-symbols:group',
      'material-symbols:lightbulb',
      'material-symbols:search',
      'ic:baseline-emoji-emotions',
      'ic:baseline-emoji-events',
      'ic:baseline-emoji-nature',
      'ic:baseline-emoji-objects',
  ];

  function handleSelect(icon: string) {
      onSelect(icon);
      onClose();
  }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-transparent" onclick={onClose}>
    <div 
      class="bg-base-100 border border-base-300 shadow-xl rounded-lg p-4 w-64 max-h-80 overflow-y-auto grid grid-cols-4 gap-2"
      onclick={e => e.stopPropagation()}
    >
      {#each commonIcons as icon}
        <button 
          class="p-2 hover:bg-base-200 rounded flex items-center justify-center text-xl"
          onclick={() => handleSelect(icon)}
        >
          <Icon icon={icon} />
        </button>
      {/each}
    </div>
</div>
