<script lang="ts">
  interface Props {
      onSelect: (url: string) => void;
      onClose: () => void;
  }

  let { onSelect, onClose }: Props = $props();

  const wallpapers = [
      'https://picsum.photos/800/200?random=1',
      'https://picsum.photos/800/200?random=2',
      'https://picsum.photos/800/200?random=3',
      'https://picsum.photos/800/200?random=4',
      'https://picsum.photos/800/200?random=5',
      'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&q=80',
      'https://images.unsplash.com/photo-1557683316-973673baf926?w=800&q=80',
      'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=800&q=80',
  ];

  function handleSelect(url: string) {
      onSelect(url);
      onClose();
  }
</script>

<dialog class="modal modal-open">
  <div class="modal-box w-11/12 max-w-4xl">
    <h3 class="font-bold text-lg mb-4">Select Wallpaper</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
       {#each wallpapers as url}
          <button 
            class="h-32 rounded-lg overflow-hidden relative group hover:ring-2 hover:ring-primary transition-all"
            onclick={() => handleSelect(url)}
          >
             <img src={url} alt="Wallpaper" class="w-full h-full object-cover" />
             <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"></div>
          </button>
       {/each}
    </div>
    <div class="modal-action">
      <button class="btn" onclick={onClose}>Close</button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button onclick={onClose}>close</button>
  </form>
</dialog>
