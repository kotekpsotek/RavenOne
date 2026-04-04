<script lang="ts">
    import { UI } from "@ravenlens/frontend";
    import ModalScreen from "./ModalScreen.svelte";
    import { selectedWorkspace } from "$lib/stores/workspace";
    import { selectedTab } from "$lib/stores/lists";
    import { selectedFile } from "$lib/stores/files";
    import { fetchAuthenticated } from "$lib/utils/fetch";
    import { File } from "@ravenlens/shared";
    import { PUBLIC_SOCKET_IO_PLAY_CONNECTION_URL } from "$env/static/public";

    let {
        open = $bindable(false)
    }: { open: boolean } = $props()

    function onClose() {
        open = false;
    }

    async function downloadRoutinesConfig() {
        // Download from backend service
        const workspaceId = $selectedWorkspace?.id ?? "test-workspace";
        const fileId = $selectedFile?.id ?? "test-file";
        const mode = $selectedTab.toLocaleLowerCase();

        try {
            const response = await fetchAuthenticated(`${PUBLIC_SOCKET_IO_PLAY_CONNECTION_URL}/routines-spikes/${mode}/download-config`, {
                method: "POST",
                headers: {
                    'Content-Type': "application/json"
                },
                body: JSON.stringify({
                    workspaceId: workspaceId,
                    fileId: fileId
                })
            });

            if (response.ok) {
                const configRoutines = await response.json() as File.RoutinesSpikesConfig.RoutineConfig[];
                return configRoutines;
            }
        }
        catch(err) {
            console.error('Cannot download Routines config', err)
        }

        // Return when error
        return [];
    }
</script>

<ModalScreen bind:open>
    <UI.Modals.ModalWrapper
        name="Routines Config"
        bind:open
        closeOnBackdrop={true}
        size={{ custom: "max-w-1/2" }}
        on:close={onClose}
    >
        <UI.Modals.ModalWrapperHeading
            headingName="Routines Config"
            on:close={onClose}
        />

        <div class="max-h-[80vh] p-4 overflow-y-auto pr-1">
            {#await downloadRoutinesConfig()}
                <div class="loading">
                    <span class="loading-spinner loading-sm"></span>
                    <span>Loading Webhooks...</span>
                </div>
            {:then routines}
                <button>
                    New Invoke-Time
                </button>

                <div>
                    {#each routines as routine}

                    {/each}
                </div>
            {:catch err}
                <div class="flex items-center justify-center w-full h-full">
                    <p class="text-error">Cannot load webhooks</p>
                </div>
            {/await}
        </div>
    </UI.Modals.ModalWrapper>
</ModalScreen>
