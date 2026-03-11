<script lang=ts>
    import { isCurrentUserSelectedFileEditor } from "$lib/stores/collaboration";
    import { isSharedRoute } from "$lib/stores/share";
    import Icon from "@iconify/svelte";

    let show = $state(false);
    let timeout: ReturnType<typeof setTimeout>;

    $effect(() => {
        if (!$isCurrentUserSelectedFileEditor && !$isSharedRoute) {
            timeout = setTimeout(() => {
                show = true;
            }, 300);
        } else {
            show = false;
            clearTimeout(timeout);
        }

        return () => clearTimeout(timeout);
    });
</script>

{#if show}
    <div
        class="text-xs flex gap-2 items-center text-base-content/70"
        title="Other user is editting file, hence you cannot edit file"
    >
        <Icon icon="material-symbols:edit-off-rounded" class="w-4 h-4"/>
        <span>Other user is editting</span>
    </div>
{/if}
