<script>
    import { loadingState } from "$lib/stores/loadingScreen";

</script>

{#if $loadingState}
    <div class="flex flex-col gap-2 items-center justify-center absolute top-0 right-0 w-full h-full bg-black/70">
        <span class="loading loading-spinner loading-xs"></span>
        <span>Loading...</span>
    </div>
{/if}
