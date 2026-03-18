<script lang="ts">
    import FileEntry from "../sideStripe/expansionPanel/FileEntry.svelte";
    import { entriesList } from "$lib/stores/files";
    import { UI } from "@ravenlens/frontend";
    import { File } from "@ravenlens/shared";

    type SelectedFilePayload = File.File.File[];
    
    interface Props {
        open: boolean;
        selectMultiple: boolean;
        selectedFiles: SelectedFilePayload;
        availableFiles: SelectedFilePayload;
        /** Selected when user accepted selection */
        onClose?: () => void | Promise<void>;
    }
    
    let {
        open = $bindable(false),
        selectMultiple = false,
        selectedFiles = $bindable([]),
        availableFiles = $bindable($entriesList),
        onClose = () => { open = false },
    }: Props = $props();
    let selectedFilesOperation: File.File.File[] = $derived(selectedFiles);

    function onSelectToggleFileWrapper(selectedFile: File.File.File) {
        if (!selectMultiple && selectedFilesOperation.length) {
            selectedFilesOperation = [selectedFile];
        }
        else if (selectMultiple) {
            const isThisFileSelectedAlreadyIndex = selectedFilesOperation.findIndex(sFile => sFile.id === selectedFile.id);

            if (isThisFileSelectedAlreadyIndex > -1) {
                selectedFilesOperation.splice(isThisFileSelectedAlreadyIndex, 1);
                selectedFilesOperation = selectedFilesOperation;
            }
            else selectedFilesOperation = [...selectedFilesOperation, selectedFile];
        }
    }

    async function noopOnNewFile() {
        return;
    }

    function onSelectAccepted() {
        selectedFiles = selectedFilesOperation;
        open = false;
    }
</script>

{#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-[60] bg-black/40" onclick={onClose}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="flex min-h-full items-center justify-center p-4" onclick={(event) => event.stopPropagation()}>
            <UI.Modals.ModalWrapper
                name="{selectMultiple ? "Documents" : "Document"} Selection"
                bind:open={open}
                closeOnBackdrop={true}
                size="md"
                on:close={onClose}
            >
                <UI.Modals.ModalWrapperHeading headingName="{selectMultiple ? "Documents" : "Document"} Selection" on:close={onClose} />

                <div class="pt-2 flex flex-col gap-3">
                    {#each availableFiles as availableFile (availableFile.id)}
                        <FileEntry
                            entry={availableFile}
                            selectedEntriesId={selectedFilesOperation.map(file => file.id)}
                            onNewFile={noopOnNewFile}
                            isSelectable={true}
                            isDraggable={false}
                            isContextMenuOpenable={false}
                            isNewFileAddable={false}
                            onSelectFile={onSelectToggleFileWrapper}
                        />
                    {/each}
                </div>

                <div class="mt-4 flex justify-end gap-2">
                    <button class="btn btn-ghost" onclick={onClose}>Cancel</button>
                    <button class="btn btn-primary" onclick={onSelectAccepted}>Accept Selection</button>
                </div>
            </UI.Modals.ModalWrapper>
        </div>
    </div>
{/if}