<script lang="ts">
    import type { ContextDeviceFile, ContextEditorFile, ContextNetworkURL, ContextSpecificationPayload } from "$lib/editorComponents/types/AIList";
    import { selectedFile } from "$lib/stores/files";
    import Icon from "@iconify/svelte";
    import { UI } from "@ravenlens/frontend";

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
        infoMessage = ""
    } = $props<{
        open: boolean;
        contextPayload: ContextSpecificationPayload;
        onSave?: (payload: ContextSpecificationPayload) => void;
        infoMessage?: string;
    }>();

    // ...
    const contextPayloadClone = cloneContextPayload(contextPayload);
    let desktopContextFiles = $state<ContextDeviceFile[]>(contextPayloadClone.desktopFiles);
    let editorContextFiles = $state<ContextEditorFile[]>(contextPayloadClone.editorFiles);
    let networkContextUrls = $state<ContextNetworkURL[]>(contextPayloadClone.networkUrls);
    let networkUrlDraft = $state("");

    function cloneContextPayload(payload: ContextSpecificationPayload): ContextSpecificationPayload {
        return {
            desktopFiles: [...payload.desktopFiles],
            editorFiles: [...payload.editorFiles],
            networkUrls: [...payload.networkUrls]
        };
    }

    // ...
    function closeContextModal() {
        open = false;
    }

    function removeDesktopContextFile(id: string) {
        desktopContextFiles = desktopContextFiles.filter((entry) => entry.id !== id);
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
                const isImage = file.type.startsWith("image/");

                return {
                    id: `${file.name}-${file.lastModified}-${file.size}`,
                    name: file.name,
                    type: file.type || "application/octet-stream",
                    size: file.size,
                    locationHint,
                    previewDataUrl: isImage ? await fileToDataUrl(file) : undefined
                } satisfies ContextDeviceFile;
            })
        );

        desktopContextFiles = [...desktopContextFiles, ...filesToAdd].filter(
            (entry, index, list) => list.findIndex((check) => check.id === entry.id) === index
        );

        target.value = "";
    }

    function addSelectedEditorFile() {
        if (!$selectedFile) {
            return;
        }

        const nextFile: ContextEditorFile = {
            id: $selectedFile.id,
            name: $selectedFile.name
        };

        if (editorContextFiles.some((entry) => entry.id === nextFile.id)) {
            return;
        }

        editorContextFiles = [...editorContextFiles, nextFile];
    }

    function removeEditorContextFile(id: string) {
        editorContextFiles = editorContextFiles.filter((entry) => entry.id !== id);
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
        const payload: ContextSpecificationPayload = {
            desktopFiles: desktopContextFiles,
            editorFiles: editorContextFiles,
            networkUrls: networkContextUrls
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
                                    <div class="flex items-center gap-2 min-w-0">
                                        {#if file.previewDataUrl}
                                            <img src={file.previewDataUrl} alt={file.name} class="w-8 h-8 rounded object-cover" />
                                        {:else}
                                            <Icon icon="material-symbols:description-outline-rounded" class="w-5 h-5 opacity-70" />
                                        {/if}
                                        <span class="text-xs truncate">{file.name}</span>
                                    </div>
                                    <button class="btn btn-ghost btn-xs" title="Remove file" onclick={() => removeDesktopContextFile(file.id)}>
                                        <Icon icon="material-symbols:close-rounded" class="w-4 h-4" />
                                    </button>
                                </div>
                            {/each}
                        </div>
                    </div>

                    <div class="space-y-2">
                        <div class="flex items-center justify-between">
                            <p class="text-xs uppercase tracking-wide opacity-70">Editor files</p>
                            <button
                                class="btn btn-xs btn-ghost"
                                onclick={addSelectedEditorFile}
                                disabled={!$selectedFile}
                                title="Add currently selected editor file"
                            >
                                <Icon icon="material-symbols:add-rounded" class="w-4 h-4" />
                                <span>Add selected</span>
                            </button>
                        </div>

                        <div class="space-y-1 max-h-24 overflow-auto">
                            {#if editorContextFiles.length === 0}
                                <p class="text-xs opacity-60">No editor files selected.</p>
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
                </div>

                <div class="mt-4 flex justify-end gap-2">
                    <button class="btn btn-ghost" onclick={closeContextModal}>Cancel</button>
                    <button class="btn btn-primary" onclick={handleSaveContext}>Save context</button>
                </div>
            </UI.Modals.ModalWrapper>
        </div>
    </div>
{/if}