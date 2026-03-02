<script lang=ts>
    import { clickedListItemId } from "$lib/stores/hoveredListItem";
    import Icon from "@iconify/svelte";

    let { itemId }: { itemId: string } = $props();
</script>

<svelte:window
    onclick={_ => $clickedListItemId = null}
/>

<button
    class="text-gray-400 p-1 rounded-lg {$clickedListItemId === itemId ? "bg-base-300" : ""}"
    onclick={clickedListItemId.handleMouseMenuClick(itemId)}
>
    <Icon icon="material-symbols:menu-rounded"/>
</button>
