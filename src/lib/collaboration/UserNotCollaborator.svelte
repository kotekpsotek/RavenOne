<script lang=ts>
    import { isCurrentUserSelectedFileEditor } from "$lib/stores/collaboration";
    import { isSharedRoute } from "$lib/stores/share";
    import Icon from "@iconify/svelte";
</script>

{#if !$isCurrentUserSelectedFileEditor && !$isSharedRoute}
    <div
        class="text-xs flex gap-2 items-center text-base-content/70"
        title="Other user is editting file, hence you cannot edit file"
    >
        <Icon icon="material-symbols:edit-off-rounded" class="w-4 h-4"/>
        <span>Other user is editting</span>
    </div>
{/if}
