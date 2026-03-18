<script lang="ts">
    import { File } from "@ravenlens/shared";
    import { entriesList, selectedFile } from "$lib/stores/files";
    import Icon from "@iconify/svelte";
    import { UI } from "@ravenlens/frontend";
    import FileSelectionModal from "./FileSelectionModal.svelte";

    // ...
    let {
        open = $bindable(false),
        mcpConfigurationDraft = $bindable(""),
        mcpConfigurationError = $bindable(""),
        contextPayload = {
            desktopFiles: [],
            editorFiles: [],
            networkUrls: []
        },
        onSave,
        infoMessage = "",
        children
    } = $props<{
        open: boolean;
        contextPayload: File.FileAI.ContextSpecificationPayload;
        onSave?: (payload: File.FileAI.ContextSpecificationPayload) => void;
        infoMessage?: string;
        children: HTMLDivElement;
    }>();

    // ...
    let desktopContextFiles = $state<File.FileAI.ContextDeviceFile[]>([]);
    let isEditorCurrentFileSelected = $state(false);
    let editorContextFiles = $state<File.FileAI.ContextEditorFile[]>([]);
    let networkContextUrls = $state<File.FileAI.ContextNetworkURL[]>([]);
    let networkUrlDraft = $state("");

    let isSelectFileModalOpen = $state(false);
    let selectedFiles: File.File.File[] = $state([]);
    let initialContextSignature = $state("");
    $effect(() => {
        if (!open) {
            return;
        }

        const contextPayloadClone = cloneContextPayload(contextPayload);
        const uniqueDesktopFiles = deduplicateEntriesById(contextPayloadClone.desktopFiles);
        const uniqueEditorFiles = deduplicateEntriesById(contextPayloadClone.editorFiles);
        const uniqueNetworkUrls = deduplicateEntriesById(contextPayloadClone.networkUrls);

        initialContextSignature = buildContextSignature({
            desktopFiles: uniqueDesktopFiles,
            editorFiles: uniqueEditorFiles,
            networkUrls: uniqueNetworkUrls
        });

        desktopContextFiles = uniqueDesktopFiles;
        editorContextFiles = uniqueEditorFiles;
        networkContextUrls = uniqueNetworkUrls;

        selectedFiles = deduplicateEntriesById(
            uniqueEditorFiles.map((editorFile) => ({ id: editorFile.id, name: editorFile.name } as File.File.File))
        );

        isEditorCurrentFileSelected = Boolean($selectedFile && uniqueEditorFiles.some((entry) => entry.id === $selectedFile.id));
    })

    $effect(() => {
        selectedFiles;

        const currentFileContext = (isEditorCurrentFileSelected && $selectedFile)
            ? [{ id: $selectedFile.id, name: $selectedFile.name }]
            : [];

        editorContextFiles = deduplicateEntriesById([
            ...currentFileContext,
            ...selectedFiles.map((selectedFileItem) => ({ id: selectedFileItem.id, name: selectedFileItem.name }))
        ]);
    })

    let hasContextChanges = $derived.by(() => {
        const currentPayload: File.FileAI.ContextSpecificationPayload = {
            desktopFiles: deduplicateEntriesById(desktopContextFiles),
            editorFiles: deduplicateEntriesById(editorContextFiles),
            networkUrls: deduplicateEntriesById(networkContextUrls)
        };

        return buildContextSignature(currentPayload) !== initialContextSignature;
    });

    function cloneContextPayload(payload: File.FileAI.ContextSpecificationPayload): File.FileAI.ContextSpecificationPayload {
        return {
            desktopFiles: [...payload.desktopFiles],
            editorFiles: [...payload.editorFiles],
            networkUrls: [...payload.networkUrls]
        };
    }

    function deduplicateEntriesById<T extends { id: string }>(entries: T[]): T[] {
        return entries.filter((entry, index, list) => list.findIndex((check) => check.id === entry.id) === index);
    }

    function buildContextSignature(payload: File.FileAI.ContextSpecificationPayload) {
        const desktopFileIds = Array.from(new Set(payload.desktopFiles.map((entry) => entry.id))).sort((left, right) => left.localeCompare(right));
        const editorFileIds = Array.from(new Set(payload.editorFiles.map((entry) => entry.id))).sort((left, right) => left.localeCompare(right));
        const networkUrls = Array.from(new Set(payload.networkUrls.map((entry) => entry.url))).sort((left, right) => left.localeCompare(right));

        return `${desktopFileIds.join("|")}::${editorFileIds.join("|")}::${networkUrls.join("|")}`;
    }

    // ...
    function closeContextModal() {
        open = false;
    }

    function removeDesktopContextFile(id: string) {
        desktopContextFiles = desktopContextFiles.filter((entry) => entry.id !== id);
    }

    function openDesktopContextFilePreview(file: File.FileAI.ContextDeviceFile) {
        if (!file.previewDataUrl) {
            return;
        }

        window.open(file.previewDataUrl, "_blank", "noopener,noreferrer");
    }

    async function fileToDataUrl(file: globalThis.File) {
        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.onerror = () => reject(new Error("Failed to read file"));
            reader.readAsDataURL(file);
        });
    }
    
    async function onDesktopFilesChange(event: Event) {
        const target = event.currentTarget as HTMLInputElement;
        const fileList = Array.from(target.files ?? []);
        if (!fileList.length) {
            return;
        }

        const locationHint = target.value || "Desktop";

        const filesToAdd = await Promise.all(
            fileList.map(async (file) => {
                const previewDataUrl = await fileToDataUrl(file);

                return {
                    id: `${file.name}-${file.lastModified}-${file.size}`,
                    name: file.name,
                    type: file.type || "application/octet-stream",
                    size: file.size,
                    locationHint,
                    previewDataUrl
                } satisfies File.FileAI.ContextDeviceFile;
            })
        );

        desktopContextFiles = [...desktopContextFiles, ...filesToAdd].filter(
            (entry, index, list) => list.findIndex((check) => check.id === entry.id) === index
        );

        target.value = "";
    }

    function onAddCurrentFile() {
        if (!isEditorCurrentFileSelected) {
            if (!$selectedFile) {
                return;
            }
    
            const nextFile: File.FileAI.ContextEditorFile = {
                id: $selectedFile.id,
                name: $selectedFile.name
            };
    
            if (editorContextFiles.some((entry) => entry.id === nextFile.id)) {
                return;
            }
    
            const isFileContextAlreadySelected = editorContextFiles.some(eFC => eFC.id === nextFile.id);
            if (!isFileContextAlreadySelected) {
                editorContextFiles = [...editorContextFiles, nextFile];
            }

            // Add to reflect changes on File Selection Modal
            const isFileAlreadySelected = selectedFiles.some(sF => sF.id === $selectedFile.id);
            if (!isFileAlreadySelected) {
                selectedFiles = [...selectedFiles, $selectedFile];
            }
        }
        else if ($selectedFile && isEditorCurrentFileSelected) {
            editorContextFiles = editorContextFiles.filter(ecF => ecF.id !== $selectedFile.id);

            // Remove for reflect changes on File Selection Modal
            selectedFiles = selectedFiles.filter(sF => sF.id !== $selectedFile.id);
        }

        isEditorCurrentFileSelected = !isEditorCurrentFileSelected;
    }

    function onSelectFileModalToggle() {
        isSelectFileModalOpen = !isSelectFileModalOpen;
    }

    function removeEditorContextFile(id: string) {
        // Unselects current file as selected
        if (isEditorCurrentFileSelected && id === $selectedFile?.id) {
            isEditorCurrentFileSelected = false;
        }
        
        // Remove other files
        editorContextFiles = editorContextFiles.filter((entry) => entry.id !== id);

        // Remove file from selected files list
        selectedFiles = selectedFiles.filter(sF => sF.id !== id);
    }

    function normalizeNetworkUrl(rawUrl: string) {
        const maybeWithProtocol = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
        const parsed = new URL(maybeWithProtocol);
        return parsed.toString();
    }

    function getFaviconUrl(targetUrl: string) {
        const host = new URL(targetUrl).hostname;
        return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
    }

    function handleSaveContext() {
        const payload: File.FileAI.ContextSpecificationPayload = {
            desktopFiles: deduplicateEntriesById(desktopContextFiles),
            editorFiles: deduplicateEntriesById(editorContextFiles),
            networkUrls: deduplicateEntriesById(networkContextUrls)
        };

        if (onSave) {
            onSave(payload);
        }

        open = false;
    }

    function addNetworkUrl() {
        const rawDraft = networkUrlDraft.trim();
        if (!rawDraft) {
            return;
        }

        try {
            const normalizedUrl = normalizeNetworkUrl(rawDraft);

            if (networkContextUrls.some((entry) => entry.url === normalizedUrl)) {
                networkUrlDraft = "";
                return;
            }

            networkContextUrls = [
                ...networkContextUrls,
                {
                    id: `${normalizedUrl}-${Date.now()}`,
                    url: normalizedUrl,
                    favicon: getFaviconUrl(normalizedUrl)
                }
            ];
            networkUrlDraft = "";
        } catch {
            console.warn("Invalid network url", rawDraft);
        }
    }

    function removeNetworkUrl(id: string) {
        networkContextUrls = networkContextUrls.filter((entry) => entry.id !== id);
    }
</script>

{#if isSelectFileModalOpen}
    <FileSelectionModal
        selectMultiple={true}
        availableFiles={$entriesList}
        onClose={onSelectFileModalToggle}
        bind:open={isSelectFileModalOpen}
        bind:selectedFiles
    />
{:else}
    {#if open}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="fixed inset-0 z-[60] bg-black/40" onclick={closeContextModal}>
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="flex min-h-full items-center justify-center p-4" onclick={(event) => event.stopPropagation()}>
                <UI.Modals.ModalWrapper
                    name="Context specification"
                    bind:open={open}
                    closeOnBackdrop={true}
                    size="md"
                    on:close={closeContextModal}
                >
                    <UI.Modals.ModalWrapperHeading headingName="Context specification" on:close={closeContextModal} />

                    {#if infoMessage}
                        <p class="pt-2 text-xs opacity-70">{infoMessage}</p>
                    {/if}

                    <div class="pt-2 flex flex-col gap-3">
                        <div class="space-y-2">
                            <div class="flex items-center justify-between">
                                <p class="text-xs uppercase tracking-wide opacity-70">Desktop files</p>
                                <label class="btn btn-xs btn-ghost" title="Add files from desktop">
                                    <Icon icon="material-symbols:upload-file-outline-rounded" class="w-4 h-4" />
                                    <span>Add files</span>
                                    <input
                                        type="file"
                                        multiple
                                        class="hidden"
                                        onchange={onDesktopFilesChange}
                                    />
                                </label>
                            </div>

                            <div class="space-y-1 max-h-28 overflow-auto">
                                {#if desktopContextFiles.length === 0}
                                    <p class="text-xs opacity-60">No desktop files selected.</p>
                                {/if}

                                {#each desktopContextFiles as file (file.id)}
                                    <div class="flex items-center justify-between rounded border border-base-300 px-2 py-1" title={file.locationHint}>
                                        <button
                                            type="button"
                                            class="flex items-center gap-2 min-w-0 flex-1 text-left"
                                            onclick={() => openDesktopContextFilePreview(file)}
                                            disabled={!file.previewDataUrl}
                                            title={file.previewDataUrl ? "Open file preview in a new tab" : "Preview unavailable for this file"}
                                        >
                                            {#if file.type.startsWith("image/") && file.previewDataUrl}
                                                <img src={file.previewDataUrl} alt={file.name} class="w-8 h-8 rounded object-cover" />
                                            {:else}
                                                <Icon icon="material-symbols:description-outline-rounded" class="w-5 h-5 opacity-70" />
                                            {/if}
                                            <span class="text-xs truncate">{file.name}</span>
                                        </button>
                                        <button class="btn btn-ghost btn-xs" title="Remove file" onclick={() => removeDesktopContextFile(file.id)}>
                                            <Icon icon="material-symbols:close-rounded" class="w-4 h-4" />
                                        </button>
                                    </div>
                                {/each}
                            </div>
                        </div>

                        <div class="space-y-2">
                            <div class="flex items-center justify-between">
                                <p class="text-xs uppercase tracking-wide opacity-70">Editor documents</p>

                                <div class="flex gap-2">
                                    <button
                                        class="btn btn-xs btn-ghost {isEditorCurrentFileSelected ? "btn-active" : ""}"
                                        onclick={onAddCurrentFile}
                                        disabled={!$selectedFile}
                                        title="Add currently selected editor file"
                                    >
                                        <Icon icon="material-symbols:add-rounded" class="w-4 h-4" />
                                        <span>Add Current</span>
                                    </button>

                                    <button
                                        class="btn btn-xs btn-ghost"
                                        onclick={onSelectFileModalToggle}
                                        disabled={!$selectedFile}
                                        title="Add currently selected editor file"
                                    >
                                        <Icon icon="material-symbols:add-rounded" class="w-4 h-4" />
                                        <span>Select Documents</span>
                                    </button>
                                </div>
                            </div>

                            <div class="space-y-1 max-h-24 overflow-auto">
                                {#if editorContextFiles.length === 0}
                                    <p class="text-xs opacity-60">No editor documents selected.</p>
                                {/if}

                                {#each editorContextFiles as file (file.id)}
                                    <div class="flex items-center justify-between rounded border border-base-300 px-2 py-1">
                                        <div class="flex items-center gap-2 min-w-0">
                                            <Icon icon="material-symbols:article-outline-rounded" class="w-5 h-5 opacity-70" />
                                            <span class="text-xs truncate">{file.name}</span>
                                        </div>

                                        <button class="btn btn-ghost btn-xs" title="Remove editor file" onclick={() => removeEditorContextFile(file.id)}>
                                            <Icon icon="material-symbols:close-rounded" class="w-4 h-4" />
                                        </button>
                                    </div>
                                {/each}
                            </div>
                        </div>

                        <div class="space-y-2">
                            <p class="text-xs uppercase tracking-wide opacity-70">Network URLs</p>

                            <div class="join w-full">
                                <input
                                    class="input input-sm input-bordered join-item w-full"
                                    placeholder="https://youtube.com/..."
                                    bind:value={networkUrlDraft}
                                />
                                <button class="btn btn-sm join-item" onclick={addNetworkUrl} title="Add URL">
                                    <Icon icon="material-symbols:add-link-rounded" class="w-4 h-4" />
                                </button>
                            </div>

                            <div class="space-y-1 max-h-24 overflow-auto">
                                {#if networkContextUrls.length === 0}
                                    <p class="text-xs opacity-60">No URLs added.</p>
                                {/if}

                                {#each networkContextUrls as entry (entry.id)}
                                    <div class="flex items-center justify-between rounded border border-base-300 px-2 py-1">
                                        <div class="flex items-center gap-2 min-w-0">
                                            <img src={entry.favicon} alt="website favicon" class="w-4 h-4" />
                                            <span class="text-xs truncate">{entry.url}</span>
                                        </div>

                                        <button class="btn btn-ghost btn-xs" title="Remove URL" onclick={() => removeNetworkUrl(entry.id)}>
                                            <Icon icon="material-symbols:close-rounded" class="w-4 h-4" />
                                        </button>
                                    </div>
                                {/each}
                            </div>
                        </div>

                        {@render children()}
                    </div>

                    {#if hasContextChanges}
                        <div class="mt-4 flex justify-end gap-2">
                            <button class="btn btn-ghost" onclick={closeContextModal}>Cancel</button>
                            <button class="btn btn-primary" onclick={handleSaveContext}>Save context</button>
                        </div>
                    {/if}
                </UI.Modals.ModalWrapper>
            </div>
        </div>
    {/if}
{/if}