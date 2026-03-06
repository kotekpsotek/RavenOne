<script lang="ts">
    import { isFileSaving } from "$lib/stores/files";

    
</script>

{#if $isFileSaving}
    <div class="flex gap-2 items-center text-gray-500">
        <span class="loading loading-spinner loading-xs"></span>
        <span class="font-semibold">Saving file</span>
    </div>
{/if}
