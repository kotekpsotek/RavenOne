<script lang="ts">
  import { NodeViewWrapper } from 'svelte-tiptap';
  import Icon from '@iconify/svelte';
  import { untrack } from 'svelte';
  import IconPicker from '../components/IconPicker.svelte';
  import WallpaperPicker from '../components/WallpaperPicker.svelte';

  // Using legacy props to play nice with svelte-tiptap wrapper if strict mode issues arise,
  // but adding rune reactivity.
  // Actually, let's use $props() if we can, but svelte-tiptap might require `export let`.
  // sticking to export let for libs often safer unless sure.
  
  interface Props {
      node: any;
      updateAttributes: (attrs: any) => void;
      selected: boolean;
  }
  
  let { node, updateAttributes, selected }: Props = $props();

  // Local state that syncs with node attributes
  // We use a temporary variable to avoid Svelte warning about "capturing initial value"
  // kept in sync via efffect below
  const initialTitle = untrack(() => node.attrs.title) || '';
  const initialDesc = untrack(() => node.attrs.description) || '';
  
  let title = $state(initialTitle);
  let description = $state(initialDesc);
  let showIconPicker = $state(false);
  let showWallpaperPicker = $state(false);
  let titleInput: HTMLElement;
  
  // Sync from parent (Tiptap) on change (e.g. Undo/Redo)
  $effect(() => {
     if (node.attrs.title !== title) title = node.attrs.title || '';
     if (node.attrs.description !== description) description = node.attrs.description || '';
  });

  $effect(() => {
    // If selected by keyboard (e.g. Backspace from next block), focus title
    if (selected && titleInput) {
       titleInput.focus();
    }
  });

  function handleTitleInput(e: Event) {
    const val = (e.target as HTMLElement).innerText;
    title = val; // update local
    updateAttributes({ title: val });
  }

  function handleDescInput(e: Event) {
    const val = (e.target as HTMLElement).innerText;
    description = val;
    updateAttributes({ description: val });
  }

  function addIcon() {
    showIconPicker = true;
  }

  function addWallpaper() {
    showWallpaperPicker = true;
  }
</script>

<NodeViewWrapper class="group relative my-8">
  {#if showIconPicker}
      <IconPicker 
          onSelect={(icon) => updateAttributes({ icon })} 
          onClose={() => showIconPicker = false} 
      />
  {/if}

  {#if showWallpaperPicker}
    <WallpaperPicker 
        onSelect={(url) => updateAttributes({ wallpaper: url })} 
        onClose={() => showWallpaperPicker = false} 
    />
  {/if}

  <!-- Actions (visible on hover) -->
  <div class="flex gap-4 text-xs text-base-content/50 mb-2 opacity-0 group-hover:opacity-100 transition-opacity">
    <button class="flex items-center gap-1 hover:text-primary transition-colors" onclick={addIcon}>
      <Icon icon="material-symbols:add" /> Add Icon
    </button>
    <button class="flex items-center gap-1 hover:text-primary transition-colors" onclick={addWallpaper}>
      <Icon icon="material-symbols:image" /> Add Wallpaper
    </button>
  </div>

  {#if node.attrs.wallpaper}
    <div class="h-64 w-full object-cover mb-4 rounded-lg overflow-hidden relative">
      <img src={node.attrs.wallpaper} alt="Cover" class="w-full h-full object-cover" />
       <button 
         class="absolute top-2 right-2 btn btn-xs btn-circle btn-ghost bg-black/50 text-white border-0"
         onclick={() => updateAttributes({ wallpaper: null })}
       >
         ✕
       </button>
    </div>
  {/if}

  {#if node.attrs.icon}
    <div class="text-4xl mb-4 text-base-content">
      <Icon icon={node.attrs.icon} />
    </div>
  {/if}

  <!-- Title Input -->
  <div 
    class="text-4xl font-bold font-serif mb-2 outline-none empty:before:content-['Document_Name'] empty:before:text-base-content/30"
    contenteditable="true"
    bind:this={titleInput}
    oninput={handleTitleInput}
  >
    {node.attrs.title}
  </div>

  <!-- Description Input -->
   <div 
    class="text-lg text-base-content/70 outline-none empty:before:content-['Document_Description'] empty:before:text-base-content/30"
    contenteditable="true"
    oninput={handleDescInput}
  >
    {node.attrs.description}
  </div>

</NodeViewWrapper>
