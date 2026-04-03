<script lang=ts>
    import { PUBLIC_SOCKET_IO_PLAY_CONNECTION_URL } from "$env/static/public";
    import { selectedFile } from "$lib/stores/files";
    import { selectedTab } from "$lib/stores/lists";
    import { selectedWorkspace } from "$lib/stores/workspace";
    import { fetchAuthenticated } from "$lib/utils/fetch";
    import Icon from "@iconify/svelte";
    import { File } from "@ravenlens/shared";
    import { get } from "svelte/store";

    async function donwloadResults() {
        const mode = get(selectedTab).toLocaleLowerCase();
        const fetchResult = await fetchAuthenticated(
            `${PUBLIC_SOCKET_IO_PLAY_CONNECTION_URL}/routines-spikes/${mode}/download-results`,
            {
                method: "POST",
                headers: {
                    'Content-Type': "application/json"
                },
                body: JSON.stringify({
                    fileId: get(selectedFile)?.id,
                    workspaceId: get(selectedWorkspace)?.id
                })
            }
        );

        if (fetchResult) {
            const results = await fetchResult.json() as File.RoutinesSpikes.FrontendDownloadResultObject[];

            return results.map(result => ({
                ...result,
                date: new Date(result.date)
            }))
        }

        return [];
    }
</script>
<!--
1. Show the results tray [v]
2. [v] Download execution result from backend and download with {#await :then :catch} block 
    - show the loading spinner once is loading
    - show the list once clicked

TODO:
3. Clicked item has to show the generated documents below and unclicked has to hide -> multiple lists can be clicked simulatenously
4. Clicked document instead of #listItemContent shows the document while upper stripe has the arrow left to go go back
    - clicked document on Results list is shown as clicked
    ! Only one document can be clicked atime
5. Switching among files causes to close the selected document
-->

<section class="execution-results h-full overflow-y-auto bg-base-100 p-4">
    <div class="mb-4 flex items-center gap-2 border-b border-base-300 pb-3">
        <Icon icon="material-symbols:checklist-rtl-rounded" class="text-lg text-base-content" />
        <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content">Execution Results</h3>
    </div>

    {#await donwloadResults()}
        <div class="flex items-center justify-center w-full h-full">
            <span class="loading-spinner loading-sm"></span>
            <span>Loading Results...</span>
        </div>
    {:then results}
        <div class="space-y-2 h-full">
            {#if results.length}
                {#each results as result}
                    <button
                        type="button"
                        class="w-full rounded-md px-2 py-2 text-left text-sm text-base-content/70 transition-colors hover:bg-base-200"
                    >
                        23.03.2026 (Title default is date)
                    </button>
                {/each}
            {:else}
                <div class="flex items-center text-sm justify-center w-full h-full">
                    <span>There isn't any execution result</span>
                </div>
            {/if}
        </div>
    {:catch err}
        <div class="flex items-center justify-center w-full h-full">
            <p class="text-error">Cannot load results</p>
        </div>
    {/await}
</section>