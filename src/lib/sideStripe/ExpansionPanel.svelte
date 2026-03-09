<script lang="ts">
    import { goto } from "$app/navigation";
    import { UI } from "@ravenlens/frontend";
    import { entriesList, moveEntry, selectedFile } from "$lib/stores/files";
    import { canManageWorkspaceFiles, workspaceHasActiveSubscription, workspaceSubscriptionCheckInProgress } from "$lib/stores/subscription";
    import { selectedWorkspace } from "$lib/stores/workspace";
    import Icon from "@iconify/svelte";
    import IconSelectionModal from "$lib/modals/IconSelectionModal.svelte";
    import WallpaperSelectionModal from "$lib/modals/WallpaperSelectionModal.svelte";
    import IconValue from "$lib/IconValue.svelte";
    import { setAlert } from "$lib/utils/alert";
    import { onMount, tick } from "svelte";
    import { get } from "svelte/store";
    import { File } from "@ravenlens/shared";
    import { changeFilePositionRequest, changeIconFileRequest, changeWalperFileRequest, deleteFileRequest, downloadFilesRequest, newFileRequest, renameFileRequest } from "$lib/files/connections/connections";
    import type { DropPosition } from "$lib/files/utils";
 
    let { isExpanded = false }: { isExpanded?: boolean } = $props();
    function getCurrentWorkspaceId(): string | null {
        const workspaceId = $selectedWorkspace?.id?.trim();
        if (!workspaceId) {
            setAlert("warning", "Workspace not selected", "Select workspace before managing files.");
            return null;
        }

        return workspaceId;
    }

    let activeWorkspaceId: string | null = null;
    let filesSyncRequestId = 0;

    async function downloadWorkspaceFiles(workspaceId: string) {
        const currentRequestId = ++filesSyncRequestId;

        const responseBody = await downloadFilesRequest(workspaceId);
        if (currentRequestId !== filesSyncRequestId || workspaceId !== activeWorkspaceId) {
            return;
        }

        if (!responseBody) {
            return;
        }

        const downloadedFiles = Array.isArray(responseBody.files) ? responseBody.files : [];
        entriesList.set(downloadedFiles);

        const selectedFileCurrent = get(selectedFile);
        if (!selectedFileCurrent) {
            return;
        }

        const refreshedSelectedFile = findFileById(downloadedFiles, selectedFileCurrent.id);
        if (!refreshedSelectedFile) {
            selectedFile.set(undefined);
            return;
        }

        selectedFile.set(refreshedSelectedFile);
    }

    onMount(() => {
        const unsubscribe = selectedWorkspace.subscribe((workspace) => {
            const selectedWorkspaceId = workspace?.id?.trim() || null;

            if (selectedWorkspaceId === activeWorkspaceId) {
                return;
            }

            activeWorkspaceId = selectedWorkspaceId;
            entriesList.set([]);
            selectedFile.set(undefined);

            if (!selectedWorkspaceId) {
                return;
            }

            void downloadWorkspaceFiles(selectedWorkspaceId);
        });

        return unsubscribe;
    });

    let draggedId = $state<string | null>(null);
    let dropTargetId = $state<string | null>(null);
    let dropPosition = $state<DropPosition>(null);
    let contextMenu = $state<{ entryId: string; x: number; y: number } | null>(null);
    let renamingId = $state<string | null>(null);
    let renameValue = $state('');
    let deleteTarget = $state<File.File.File | null>(null);
    let iconPickerEntryId = $state<string | null>(null);
    let iconPickerInitialValue = $state("");
    let walperPickerEntryId = $state<string | null>(null);
    let walperPickerInitialValue = $state("");
    let expandedEntries = $state<Record<string, boolean>>({});
    let contextMenuEntry = $derived(contextMenu ? findFileById($entriesList, contextMenu.entryId) : null);

    function ensureActiveWorkspaceSubscription(operationName: string): boolean {
        if ($canManageWorkspaceFiles) {
            return true;
        }

        if (!$workspaceSubscriptionCheckInProgress) {
            setAlert(
                "warning",
                "Active workspace subscription required",
                `Cannot ${operationName} because this workspace has no active subscription.`
            );
        }

        return false;
    }

    function focusInputAttachment(node: HTMLInputElement) {
        queueMicrotask(() => {
            node.focus();
            node.select();
        });
    }

    async function onNewFile(targetId: string | null = null) {
        if (!ensureActiveWorkspaceSubscription("create files")) {
            return;
        }

        const workspaceId = getCurrentWorkspaceId();
        if (!workspaceId) {
            return;
        }

        const name = getNextName($entriesList, 'Task');
        const responseBody = await newFileRequest(workspaceId, targetId, name);
        if (!responseBody) {
            return;
        }

        const newFile: File.File.File = responseBody.createdFile ?? {
            type: "file",
            id: crypto.randomUUID(),
            name,
            lists: [],
            createdAt: new Date(),
            content: '',
            createdByAuthorId: workspaceId
        };

        if (targetId === null) {
            entriesList.update((list) => [...list, newFile]);
            return;
        }

        function addToTarget(items: File.File.File[]): File.File.File[] {
            return items.map((item) => {
                if (item.id === targetId) {
                    return {
                        ...item,
                        subentries: [...(item.subentries ?? []), newFile]
                    };
                }

                if (item.subentries?.length) {
                    return {
                        ...item,
                        subentries: addToTarget(item.subentries)
                    };
                }

                return item;
            });
        }

        entriesList.update((list) => addToTarget(list));
    }

    function getNextName(entries: File.File.File[], type: 'Task') {
        const prefix = `Unnamed ${type}`;
        let max = 0;
        
        function scan(items: File.File.File[]) {
            for (const item of items) {
                const match = item.name.match(new RegExp(`^${prefix} (\\d+)$`));
                if (match) {
                    const num = parseInt(match[1]);
                    if (num > max) max = num;
                }
                if (item.subentries?.length) {
                    scan(item.subentries);
                }
            }
        }
        
        scan(entries);
        return `${prefix} ${max + 1}`;
    }

    function handleDragStart(e: DragEvent, id: string) {
        draggedId = id;
        if (e.dataTransfer) {
            e.dataTransfer.setData('text/plain', id);
            e.dataTransfer.effectAllowed = 'move';
        }
    }

    function handleDragOver(e: DragEvent, entry: File.File.File) {
        e.preventDefault();
        e.stopPropagation();
        
        if (draggedId === entry.id) {
            dropTargetId = null;
            return;
        }

        dropTargetId = entry.id;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const y = e.clientY - rect.top;
        
        // Files have 3 zones: top 25% (before), middle 50% (inside), bottom 25% (after)
        if (y < rect.height * 0.25) {
            dropPosition = 'before';
        } else if (y > rect.height * 0.75) {
            dropPosition = 'after';
        } else {
            dropPosition = 'inside';
        }
    }

    async function handleDrop(e: DragEvent, targetId: string | null) {
        e.preventDefault();
        e.stopPropagation();
        
        if (draggedId && (targetId !== null || dropPosition === 'inside')) {
            const workspaceId = getCurrentWorkspaceId();
            const sourceId = draggedId;
            const nextDropPosition = dropPosition || 'inside';

            if (workspaceId) {
                const moveResult = await changeFilePositionRequest(
                    workspaceId,
                    sourceId,
                    targetId,
                    dropPosition
                );
                if (moveResult) {
                    moveEntry(sourceId, targetId, nextDropPosition);
                }
            }
        }
        
        draggedId = null;
        dropTargetId = null;
        dropPosition = null;
    }

    function handleDragEnd() {
        draggedId = null;
        dropTargetId = null;
        dropPosition = null;
    }

    function updateFileById(items: File.File.File[], fileId: string, updater: (item: File.File.File) => File.File.File): File.File.File[] {
        return items.map((item) => {
            if (item.id === fileId) {
                const updaterValue = updater(item);

                // Local File updation
                const selectedFileLocal = get(selectedFile);
                if (selectedFileLocal?.id === fileId) {
                    selectedFile.set({
                        ...selectedFileLocal,
                        ...updaterValue
                    });

                    if (updaterValue.name !== selectedFileLocal.name) {
                        document.dispatchEvent(new CustomEvent("file-name-change:leftstripe", {
                            detail: updaterValue.name
                        }));
                    }
                }
                
                // Entries updation
                return updaterValue;
            }

            if (item.subentries?.length) {
                return {
                    ...item,
                    subentries: updateFileById(item.subentries, fileId, updater)
                };
            }

            return item;
        });
    }

    function removeFileById(items: File.File.File[], fileId: string): File.File.File[] {
        return items
            .filter((item) => item.id !== fileId)
            .map((item) => {
                if (!item.subentries?.length) {
                    return item;
                }

                return {
                    ...item,
                    subentries: removeFileById(item.subentries, fileId)
                };
            });
    }

    function findFileById(items: File.File.File[], fileId: string): File.File.File | null {
        for (const item of items) {
            if (item.id === fileId) {
                return item;
            }

            if (item.subentries?.length) {
                const nested = findFileById(item.subentries, fileId);
                if (nested) {
                    return nested;
                }
            }
        }

        return null;
    }

    function onEntryContextMenu(e: MouseEvent, entry: File.File.File) {
        e.preventDefault();
        e.stopPropagation();
        contextMenu = {
            entryId: entry.id,
            x: e.clientX,
            y: e.clientY
        };
    }

    function closeContextMenu() {
        contextMenu = null;
    }

    function onWindowClick() {
        closeContextMenu();
    }

    function onWindowKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            closeContextMenu();
            renamingId = null;
            deleteTarget = null;
            closeIconPicker();
            closeWalperPicker();
        }
        else if (e.ctrlKey && e.key === "r" && $selectedFile) {
            e.preventDefault();
            openRename($selectedFile);
        }
    }

    function openRename(entry: File.File.File) {
        renamingId = entry.id;
        renameValue = entry.name;
        closeContextMenu();
    }

    async function submitRename(fileId: string) {
        const nextName = renameValue.trim();
        if (!nextName) {
            return;
        }

        const workspaceId = getCurrentWorkspaceId();
        if (!workspaceId) {
            return;
        }

        const renameResult = await renameFileRequest(workspaceId, fileId, nextName);
        if (!renameResult) {
            return;
        }

        entriesList.update((list) => updateFileById(list, fileId, (entry) => ({
            ...entry,
            name: nextName
        })));

        renamingId = null;
    }

    function cancelRename() {
        renamingId = null;
        renameValue = '';
    }

    function openIconPicker(entry: File.File.File) {
        if (!ensureActiveWorkspaceSubscription("change file icon")) {
            return;
        }

        iconPickerEntryId = entry.id;
        iconPickerInitialValue = entry.icon ?? "";
        closeContextMenu();
    }

    function closeIconPicker() {
        iconPickerEntryId = null;
        iconPickerInitialValue = "";
    }

    async function applyPickedIcon(iconValue: string) {
        if (!ensureActiveWorkspaceSubscription("change file icon")) {
            return;
        }

        if (!iconPickerEntryId) {
            return;
        }

        const entryId = iconPickerEntryId;
        const normalizedIconValue = iconValue.trim();

        const workspaceId = getCurrentWorkspaceId();
        if (!workspaceId) {
            return;
        }

        const iconUpdateResult = await changeIconFileRequest(workspaceId, entryId, normalizedIconValue);
        if (!iconUpdateResult) {
            return;
        }

        entriesList.update((list) => updateFileById(list, entryId, (entry) => ({
            ...entry,
            icon: normalizedIconValue
        })));

        if ($selectedFile?.id === entryId) {
            document.dispatchEvent(new CustomEvent("file-icon-change:leftstripe", {
                detail: {
                    fileId: entryId,
                    icon: normalizedIconValue
                }
            }));
        }

        closeIconPicker();
    }

    async function removePickedIcon() {
        if (!ensureActiveWorkspaceSubscription("change file icon")) {
            return;
        }

        if (!iconPickerEntryId) {
            return;
        }

        const entryId = iconPickerEntryId;

        const workspaceId = getCurrentWorkspaceId();
        if (!workspaceId) {
            return;
        }

        const iconUpdateResult = await changeIconFileRequest(workspaceId, entryId, null);
        if (!iconUpdateResult) {
            return;
        }

        entriesList.update((list) => updateFileById(list, entryId, (entry) => ({
            ...entry,
            icon: undefined
        })));

        if ($selectedFile?.id === entryId) {
            document.dispatchEvent(new CustomEvent("file-icon-change:leftstripe", {
                detail: {
                    fileId: entryId,
                    icon: ""
                }
            }));
        }

        closeIconPicker();
    }

    function openWalperPicker(entry: File.File.File) {
        if (!ensureActiveWorkspaceSubscription("change file wallpaper")) {
            return;
        }

        walperPickerEntryId = entry.id;
        walperPickerInitialValue = entry.walper ?? "";
        closeContextMenu();
    }

    function closeWalperPicker() {
        walperPickerEntryId = null;
        walperPickerInitialValue = "";
    }

    async function applyWalperToFile(walperValue: string) {
        if (!ensureActiveWorkspaceSubscription("change file wallpaper")) {
            return;
        }

        if (!walperPickerEntryId) {
            return;
        }

        const entryId = walperPickerEntryId;

        const workspaceId = getCurrentWorkspaceId();
        if (!workspaceId) {
            return;
        }

        const walperUpdateResult = await changeWalperFileRequest(workspaceId, entryId, walperValue);
        if (!walperUpdateResult) {
            return;
        }

        entriesList.update((list) => updateFileById(list, entryId, (entry) => ({
            ...entry,
            walper: walperValue
        })));

        if ($selectedFile?.id === entryId) {
            $selectedFile = {
                ...$selectedFile,
                walper: walperValue
            };
        }

        closeWalperPicker();
    }

    async function removeWalperFromFile() {
        if (!ensureActiveWorkspaceSubscription("change file wallpaper")) {
            return;
        }

        if (!walperPickerEntryId) {
            return;
        }

        const entryId = walperPickerEntryId;

        const workspaceId = getCurrentWorkspaceId();
        if (!workspaceId) {
            return;
        }

        const walperUpdateResult = await changeWalperFileRequest(workspaceId, entryId, null);
        if (!walperUpdateResult) {
            return;
        }

        entriesList.update((list) => updateFileById(list, entryId, (entry) => ({
            ...entry,
            walper: undefined
        })));

        if ($selectedFile?.id === entryId) {
            $selectedFile = {
                ...$selectedFile,
                walper: undefined
            };
        }

        closeWalperPicker();
    }

    function openDeleteModal(entry: File.File.File) {
        deleteTarget = entry;
        closeContextMenu();
    }

    function closeDeleteModal() {
        deleteTarget = null;
    }

    async function confirmDelete() {
        const target = deleteTarget;
        if (!target) {
            return;
        }

        const workspaceId = getCurrentWorkspaceId();
        if (!workspaceId) {
            return;
        }

        const deleteResult = await deleteFileRequest(workspaceId, target.id);
        if (!deleteResult) {
            return;
        }

        entriesList.update((list) => removeFileById(list, target.id));

        if ($selectedFile?.id === target.id) {
            $selectedFile = undefined;
        }

        // playableDocumentsWithPoints.unsetFullDocumentPlaying(target);
        deleteTarget = null;
    }

    function onEntryClick(entry: File.File.File) {
        return async () => {
            await goto("/");
            $selectedFile = entry;
        }
    }

    function hasSubentries(entry: File.File.File) {
        return (entry.subentries?.length ?? 0) > 0;
    }

    function isEntryExpanded(entry: File.File.File) {
        if (!hasSubentries(entry)) {
            return false;
        }

        return expandedEntries[entry.id] ?? true;
    }

    function toggleEntryExpanded(entryId: string) {
        expandedEntries = {
            ...expandedEntries,
            [entryId]: !(expandedEntries[entryId] ?? true)
        };
    }

    async function onEntryKeydown(e: KeyboardEvent, entry: File.File.File) {
        if (e.key === 'Enter' || e.key === ' ') {
            await goto("/");
            e.preventDefault();
            $selectedFile = entry;
        }
    }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown} />

{#snippet renderEntry(entry: File.File.File, depth = 0)}
    {@const isTarget = dropTargetId === entry.id}
    {@const entryHasSubentries = hasSubentries(entry)}
    {@const entryExpanded = isEntryExpanded(entry)}
    <div class="w-full {isTarget && dropPosition === 'before' ? 'border-t-2 border-primary' : ''} {isTarget && dropPosition === 'after' ? 'border-b-2 border-primary' : ''}">
        <div
            class="group/file flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-base-300 {isTarget && dropPosition === 'inside' ? 'bg-primary/20' : ''} {$selectedFile?.id === entry.id ? 'bg-base-300/70' : ''}"
            draggable="true"
            ondragstart={(e) => handleDragStart(e, entry.id)}
            ondragover={(e) => handleDragOver(e, entry)}
            ondrop={(e) => handleDrop(e, entry.id)}
            ondragend={handleDragEnd}
            onclick={onEntryClick(entry)}
            onkeydown={(e) => onEntryKeydown(e, entry)}
            oncontextmenu={(e) => onEntryContextMenu(e, entry)}
            role="button"
            tabindex="0"
        >
            <div class="flex min-w-0 items-center gap-2" style={`padding-left: ${depth * 12}px`}>
                {#if entryHasSubentries}
                    <button
                        class="btn btn-ghost btn-xs btn-square min-h-0 h-5 w-5"
                        onclick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleEntryExpanded(entry.id);
                        }}
                        aria-label={entryExpanded ? "Collapse subentries" : "Expand subentries"}
                    >
                        <Icon
                            icon={entryExpanded
                                ? "material-symbols:keyboard-arrow-down-rounded"
                                : "material-symbols:keyboard-arrow-right"}
                            class="text-base"
                        />
                    </button>
                {:else}
                    <span class="inline-block h-5 w-5" aria-hidden="true"></span>
                {/if}
                <div class="text-base-content/60">
                    <IconValue
                        iconValue={entry.icon}
                        iconClass="text-xl"
                        emojiClass="text-xl leading-none"
                        imageClass="h-5 w-5"
                        alt={entry.name}
                    />
                </div>
                {#if renamingId === entry.id}
                    <input
                        {@attach focusInputAttachment}
                        class="input input-sm text-sm w-full max-w-52 border-none outline-none bg-transparent"
                        bind:value={renameValue}
                        onclick={ev => ev.stopPropagation()}
                        onkeydown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                                submitRename(entry.id);
                            } else if (e.key === 'Escape') {
                                cancelRename();
                            }
                        }}
                    />
                {:else}
                    <span class="text-sm truncate">{entry.name}</span>
                {/if}
            </div>

            {#if renamingId === entry.id}
                <div class="flex items-center gap-1">
                    <button
                        class="btn btn-ghost btn-square btn-xs"
                        onclick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            submitRename(entry.id);
                        }}
                        aria-label="Accept rename"
                    >
                        <Icon icon="material-symbols:check-rounded" class="text-lg"/>
                    </button>
                    <button
                        class="btn btn-ghost btn-square btn-xs"
                        onclick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            cancelRename();
                        }}
                        aria-label="Cancel rename"
                    >
                        <Icon icon="material-symbols:close-rounded" class="text-lg"/>
                    </button>
                </div>
            {:else}
                <button
                    class="btn btn-ghost btn-square btn-xs opacity-0 group-hover/file:opacity-100 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                    onclick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onNewFile(entry.id);
                    }}
                    disabled={!$canManageWorkspaceFiles}
                    title={!$canManageWorkspaceFiles ? "Active workspace subscription required" : "Add file"}
                    aria-label="Add file"
                >
                    <Icon icon="material-symbols:add-rounded" class="text-lg"/>
                </button>
            {/if}
        </div>

        {#if entryHasSubentries && entryExpanded}
            <div class="ml-4 border-l border-base-300 pl-2 mt-0.5 space-y-0.5 min-h-[4px]">
                {#each entry.subentries as sub (sub.id)}
                    {@render renderEntry(sub, depth + 1)}
                {/each}
            </div>
        {/if}
    </div>
{/snippet}

{#if contextMenu}
    <div
        class="dropdown dropdown-open fixed z-50"
        style={`left: ${contextMenu.x}px; top: ${contextMenu.y}px;`}
    >
        <ul class="menu dropdown-content z-[1] w-52 rounded-box border border-base-300 bg-base-100 p-2 shadow-xl">
            {#if contextMenuEntry}
                <li>
                    <button
                        onclick={() => openRename(contextMenuEntry)}
                        disabled={!$canManageWorkspaceFiles}
                    >
                        Change name
                    </button>
                </li>
                <li>
                    <button
                        onclick={() => openIconPicker(contextMenuEntry)}
                        disabled={!$canManageWorkspaceFiles}
                        title={!$canManageWorkspaceFiles ? "Active workspace subscription required" : undefined}
                    >
                        {contextMenuEntry.icon ? 'Change icon' : 'Add icon'}
                    </button>
                </li>
                <li>
                    <button
                        onclick={() => openWalperPicker(contextMenuEntry)}
                        disabled={!$canManageWorkspaceFiles}
                        title={!$canManageWorkspaceFiles ? "Active workspace subscription required" : undefined}
                    >
                        {contextMenuEntry.walper ? 'Change walper' : 'Add walper'}
                    </button>
                </li>
                <li><button class="text-error" onclick={() => openDeleteModal(contextMenuEntry)}>Delete</button></li>
            {/if}
        </ul>
    </div>
{/if}

<IconSelectionModal
    open={iconPickerEntryId !== null}
    currentValue={iconPickerInitialValue}
    onClose={closeIconPicker}
    onSelect={applyPickedIcon}
    onRemove={removePickedIcon}
/>

<WallpaperSelectionModal
    open={walperPickerEntryId !== null}
    currentValue={walperPickerInitialValue}
    onClose={closeWalperPicker}
    onSelect={applyWalperToFile}
    onRemove={removeWalperFromFile}
/>

{#if isExpanded}
    <div class="flex flex-1 flex-col overflow-hidden bg-base-100/50 p-4 animate-in slide-in-from-left duration-300">
        <div class="mb-4 flex items-center justify-between">
            <h5 class="text-xs font-bold uppercase tracking-wider text-base-content/50">Tasks Explorer</h5>
        
            <div class="flex items-center gap-1">
                <button 
                    onclick={() => onNewFile()}
                    class="btn btn-ghost btn-square btn-xs hover:bg-base-300 disabled:cursor-not-allowed"
                    title={!$canManageWorkspaceFiles ? "Active workspace subscription required" : "New File"}
                    disabled={!$canManageWorkspaceFiles}
                >
                    <Icon icon="material-symbols:note-add-outline-rounded" class="text-lg"/>
                </button>
            </div>
        </div>

        <nav 
            class="flex-1 overflow-y-auto space-y-0.5 scrollbar-hide"
            ondragover={(e) => { 
                if (draggedId) {
                    e.preventDefault();
                    if (e.target === e.currentTarget) {
                        dropTargetId = null;
                        dropPosition = 'inside';
                    }
                }
            }}
            ondrop={(e) => handleDrop(e, null)}
        >
            {#each $entriesList as entry}
                {@render renderEntry(entry)}
            {/each}
        </nav>
    </div>
{/if}

{#if deleteTarget}
    <div
        class="fixed inset-0 z-[60] bg-black/40"
        onclick={(e) => {
            if (e.target === e.currentTarget) {
                closeDeleteModal();
            }
        }}
        onkeydown={onWindowKeydown}
        role="button"
        tabindex="0"
    >
        <div class="flex min-h-full items-center justify-center p-4">
            <UI.Modals.ModalWrapper
                name="Delete File"
                open={deleteTarget !== null}
                closeOnBackdrop={true}
                size="md"
                on:close={_ => deleteTarget = null}
            >
                <UI.Modals.ModalWrapperHeading
                    headingName="Delete file"
                    on:close={_ => deleteTarget = null}
                />

                <div class="pt-2">
                    <p class="text-sm opacity-80">Do you want to delete "{deleteTarget.name}"?</p>
                </div>
                
                <div class="mt-4 flex justify-end gap-2">
                    <button class="btn btn-ghost" onclick={closeDeleteModal}>Cancel</button>
                    <button class="btn btn-error" onclick={confirmDelete}>Delete</button>
                </div>
            </UI.Modals.ModalWrapper>
        </div>
    </div>
{/if}

<style>
    @reference "../../app.css";

    .dropdown-content button:disabled {
        @apply opacity-50;
    }
</style>
