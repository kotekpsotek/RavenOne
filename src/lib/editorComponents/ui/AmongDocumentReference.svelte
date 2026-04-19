<script lang="ts">
    import type { NodeViewProps } from "@tiptap/core";
    import type { File } from "@ravenlens/shared";
    import Icon from "@iconify/svelte";
    import { onDestroy, onMount } from "svelte";
    import { NodeViewWrapper } from "svelte-tiptap";
    import tippy, { type Instance } from "tippy.js";
    import { entriesList, selectedFile } from "$lib/stores/files";
    import { canManageWorkspaceFiles } from "$lib/stores/subscription";
    import { userProfile } from "$lib/stores/user";

    type FlattenedEntry = {
        id: string;
        name: string;
        depth: number;
        file: File.File.File;
    };

    let { node, editor, updateAttributes }: NodeViewProps = $props();

    let pickerAnchor = $state<HTMLButtonElement | null>(null);
    let pickerContent = $state<HTMLDivElement | null>(null);
    let pickerInstance = $state<Instance | null>(null);
    let searchQuery = $state("");
    let contextMenu = $state<{ x: number; y: number } | null>(null);

    let referenceFileId = $derived(normalizeText(node.attrs.fileId));
    let referenceFileName = $derived(normalizeText(node.attrs.fileName));
    let isEditable = $derived(Boolean(editor?.isEditable));

    let availableEntries = $derived(flattenEntries($entriesList));
    let linkedEntry = $derived(availableEntries.find((entry) => entry.id === referenceFileId));
    let linkedFile = $derived(linkedEntry?.file);
    let linkedName = $derived(linkedEntry?.name ?? referenceFileName);

    let isMissingReference = $derived(Boolean(referenceFileId) && !linkedFile);
    let canEditReference = $derived(
        isEditable
        && ($canManageWorkspaceFiles || isLinkedFileOwnedByCurrentUser(linkedFile ?? $selectedFile, $userProfile))
    );

    let filteredEntries = $derived.by(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();
        if (!normalizedQuery) {
            return availableEntries;
        }

        return availableEntries.filter((entry) => entry.name.toLowerCase().includes(normalizedQuery));
    });

    function normalizeText(value: unknown): string {
        return typeof value === "string" ? value.trim() : "";
    }

    function flattenEntries(entries: File.File.File[], depth = 0): FlattenedEntry[] {
        const flattened: FlattenedEntry[] = [];

        for (const entry of entries) {
            flattened.push({
                id: entry.id,
                name: normalizeText(entry.name) || "Untitled document",
                depth,
                file: entry
            });

            if (entry.subentries?.length) {
                flattened.push(...flattenEntries(entry.subentries, depth + 1));
            }
        }

        return flattened;
    }

    function collectCandidateIds(value: unknown, keys: string[]): string[] {
        if (!value || typeof value !== "object") {
            return [];
        }

        const record = value as Record<string, unknown>;
        const ids: string[] = [];

        for (const key of keys) {
            const candidate = normalizeText(record[key]);
            if (candidate) {
                ids.push(candidate);
            }
        }

        return ids;
    }

    function isLinkedFileOwnedByCurrentUser(file: File.File.File | undefined, profile: unknown): boolean {
        if (!file || !profile) {
            return false;
        }

        const profileCandidates = new Set(
            collectCandidateIds(profile, ["id", "userId", "authorId", "ownerUserId"])
        );

        if (!profileCandidates.size) {
            return false;
        }

        const fileOwnerCandidates = collectCandidateIds(file as unknown as Record<string, unknown>, [
            "ownerUserId",
            "createdByUserId",
            "authorId",
            "createdBy",
            "createdByAuthorId"
        ]);

        return fileOwnerCandidates.some((candidate) => profileCandidates.has(candidate));
    }

    function attachPickerAnchor(node: HTMLButtonElement) {
        pickerAnchor = node;

        return () => {
            if (pickerAnchor === node) {
                pickerAnchor = null;
            }
        };
    }

    function attachPickerContent(node: HTMLDivElement) {
        pickerContent = node;

        return () => {
            if (pickerContent === node) {
                pickerContent = null;
            }
        };
    }

    function createPickerInstance(): Instance | null {
        if (!pickerAnchor || !pickerContent) {
            return null;
        }

        if (pickerInstance) {
            return pickerInstance;
        }

        pickerContent.style.display = "block";

        pickerInstance = tippy(pickerAnchor, {
            content: pickerContent,
            appendTo: () => document.body,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
            onHidden: () => {
                searchQuery = "";
            }
        });

        return pickerInstance;
    }

    function openPicker(event?: MouseEvent) {
        event?.preventDefault();
        event?.stopPropagation();
        closeContextMenu();

        if (!canEditReference) {
            return;
        }

        const picker = createPickerInstance();
        if (!picker) {
            return;
        }

        searchQuery = "";
        picker.show();
    }

    function onReferenceContextMenu(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        if (!canEditReference) {
            return;
        }

        contextMenu = {
            x: event.clientX,
            y: event.clientY
        };
    }

    function closeContextMenu() {
        contextMenu = null;
    }

    function onWindowClick() {
        closeContextMenu();
    }

    function onWindowKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            closeContextMenu();
        }
    }

    function closePicker() {
        pickerInstance?.hide();
    }

    function onSelectReference(entry: FlattenedEntry) {
        updateAttributes({
            fileId: entry.id,
            fileName: entry.name
        });

        closePicker();
    }

    function onReferenceClick(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        if (!linkedFile) {
            if (canEditReference) {
                openPicker();
            }
            return;
        }

        selectedFile.set(linkedFile);
        closePicker();
    }

    onMount(() => {
        if (isEditable && !referenceFileId) {
            queueMicrotask(() => {
                openPicker();
            });
        }
    });

    onDestroy(() => {
        if (pickerInstance) {
            pickerInstance.destroy();
            pickerInstance = null;
        }

        if (pickerContent) {
            pickerContent.style.display = "none";
        }
    });
</script>

<NodeViewWrapper contenteditable="false" class="inline-flex items-center gap-[0.35rem] mx-[0.15rem] align-middle">
    <button
        type="button"
        class={[
            "border border-transparent text-base-content inline-flex max-w-[28rem] cursor-pointer items-center gap-[0.35rem] rounded-md px-[0.6rem] py-[0.3rem] transition-colors duration-150 ease-linear",
            isMissingReference ? "border-error/55 bg-error/12" : "hover:bg-base-300"
        ]}
        onclick={onReferenceClick}
        oncontextmenu={onReferenceContextMenu}
        {@attach attachPickerAnchor}
        title={isMissingReference ? `Missing referenced file: ${linkedName || "Unknown"}` : `Open referenced file: ${linkedName || "Unknown"}`}
    >
        <Icon icon="material-symbols:description-outline-rounded" width="16" height="16" />

        {#if isMissingReference}
            <span class="overflow-hidden truncate whitespace-nowrap text-sm">File to where pointer is made, doesn't exists "{linkedName || "Unknown"}"</span>
        {:else if linkedEntry}
            <span class="overflow-hidden truncate whitespace-nowrap text-sm">{linkedEntry.name}</span>
        {:else}
            <span class="overflow-hidden truncate whitespace-nowrap text-sm">Select document reference</span>
        {/if}
    </button>

    <div {@attach attachPickerContent} class="min-w-[20rem] max-w-[24rem]" style="display: none;">
        <div class="mb-2">
            <input
                type="text"
                class="input input-sm input-bordered w-full"
                placeholder="Search file..."
                bind:value={searchQuery}
            />
        </div>

        <ul class="menu w-[20rem] max-h-[18rem] flex-nowrap overflow-y-auto rounded-box border border-base-300 bg-base-100 p-2 text-base-content shadow-xl shadow-black/20">
            {#if filteredEntries.length === 0}
                <li>
                    <span class="text-base-content/70">No files found</span>
                </li>
            {:else}
                {#each filteredEntries as entry (entry.id)}
                    <li>
                        <button
                            type="button"
                            class:bg-base-300={entry.id === referenceFileId}
                            class:font-semibold={entry.id === referenceFileId}
                            onclick={() => onSelectReference(entry)}
                        >
                            <Icon icon="material-symbols:description-outline-rounded" width="16" height="16" class="text-base-content/70" />
                            <span class="truncate" style={`padding-left: ${entry.depth * 0.75}rem;`}>
                                {entry.name}
                            </span>
                        </button>
                    </li>
                {/each}
            {/if}
        </ul>
    </div>

    {#if contextMenu}
        <div
            class="dropdown dropdown-open fixed z-50"
        >
            <ul class="px-1 menu dropdown-content w-[200px] z-[1] rounded-box border border-base-300 bg-base-100 p-1 shadow-xl">
                <li class="px-0" style="padding-inline-start: 0px;">
                    <button 
                        class="w-full"
                        onclick={openPicker}
                    >
                        <Icon icon="material-symbols:edit-outline-rounded"/>
                        <span>
                            Edit reference
                        </span>
                    </button>
                </li>
                <li class="px-0" style="padding-inline-start: 0px;">
                    <button 
                        class="text-rose-500 w-full"
                        onclick={openPicker}
                    >
                        <Icon icon="material-symbols:delete-outline-rounded"/>
                        <span>
                            Remove
                        </span>
                    </button>
                </li>
            </ul>
        </div>
    {/if}
</NodeViewWrapper>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown} />
