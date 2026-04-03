<script lang="ts">
    import { UI } from "@ravenlens/frontend";
    import ModalScreen from "./ModalScreen.svelte";

    let {
        open = $bindable(false)
    }: { open: boolean } = $props()

    function onClose() {
        open = false;
    }

    async function downloadRoutinesConfig() {

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
            {:then webhooks}
                <button>
                    New Invoke-Time
                </button>

                <div>
                    
                </div>
            {:catch err}
                <div class="flex items-center justify-center w-full h-full">
                    <p class="text-error">Cannot load webhooks</p>
                </div>
            {/await}
        </div>
    </UI.Modals.ModalWrapper>
</ModalScreen>
