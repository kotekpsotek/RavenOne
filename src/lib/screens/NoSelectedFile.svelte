<script lang="ts">
    import { onMount } from "svelte";
    import Icon from "@iconify/svelte";
    import { isSearchModalOpen } from "../stores/files";

    let hasHistory = $state(false);

    onMount(() => {
        hasHistory = window.history.length > 1;
    });

    function openSearch() {
        $isSearchModalOpen = true;
    }
</script>

<div class="flex h-full w-full flex-col items-center justify-center gap-6 bg-base-100 text-center animate-in fade-in duration-500">
    <div class="relative">
        <div class="absolute inset-0 -z-10 animate-pulse rounded-full bg-primary/10 blur-3xl"></div>
        <div class="flex h-32 w-32 items-center justify-center rounded-3xl border border-base-300 bg-base-100 shadow-2xl shadow-primary/5">
            <Icon icon="material-symbols:article-rounded" class="h-16 w-16 text-primary/40" />
        </div>
        <div class="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-base-200">
            <Icon icon="material-symbols:help-outline-rounded" class="h-5 w-5 opacity-50" />
        </div>
    </div>

    <div class="max-w-md space-y-2 px-6">
        <h2 class="text-3xl font-bold tracking-tight text-base-content">No File Selected</h2>
        <p class="text-base-content/60 leading-relaxed">
            Select a file from the explorer on the left or press the button below to find what you are looking for.
        </p>
    </div>

    <div class="flex flex-col gap-3 sm:flex-row">
        <button 
            type="button"
            class="btn btn-primary btn-outline gap-2 px-8"
            onclick={openSearch}
        >
            <Icon icon="material-symbols:search-rounded" class="h-5 w-5" />
            Find File
        </button>
        {#if hasHistory}
            <button 
                type="button"
                class="btn btn-ghost gap-2 border border-base-300"
                onclick={() => window.history.back()}
            >
                Go Back
            </button>
        {/if}
    </div>
</div>
