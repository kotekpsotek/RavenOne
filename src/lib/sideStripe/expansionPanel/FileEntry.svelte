<script lang="ts">
    import { goto } from "$app/navigation";
    import Icon from "@iconify/svelte";
    import { UI } from "@ravenlens/frontend";
    import type { SharedFile } from "$lib/sharedCompat";
    import IconValue from "$lib/IconValue.svelte";
    import IconSelectionModal from "$lib/modals/IconSelectionModal.svelte";
    import WallpaperSelectionModal from "$lib/modals/WallpaperSelectionModal.svelte";
    import {
        changeFilePositionRequest,
        changeIconFileRequest,
        changeWalperFileRequest,
        deleteFileRequest,
        renameFileRequest
    } from "$lib/files/connections/connections";
    import type { DropPosition } from "$lib/files/utils";
    import { entriesList, moveEntry, selectedFile } from "$lib/stores/files";
    import { canManageWorkspaceFiles, workspaceSubscriptionCheckInProgress } from "$lib/stores/subscription";
    import { setAlert } from "$lib/utils/alert";
    import { findFileById, getCurrentWorkspaceId, removeFileById, updateFileById } from "./utils";
    import { page } from "$app/stores";

    interface Props {
        entry: SharedFile;
        depth?: number;
        onNewFile: (targetId?: string | null) => Promise<void>;
        isSelectable?: boolean;
        selectedEntriesId?: string[];
        isContextMenuOpenable?: boolean;
        isNewFileAddable?: boolean;
        isDraggable?: boolean;
        onSelectFile?: (clickedFile: SharedFile) => Promise<void> | void;
        draggedId?: string | null;
        dropTargetId?: string | null;
        dropPosition?: DropPosition;
    }

    let {
        entry,
        depth = 0,
        onNewFile,
        isSelectable = true,
        selectedEntriesId,
        isDraggable = true,
        isContextMenuOpenable = true,
        isNewFileAddable = true,
        onSelectFile,
        draggedId = $bindable<string | null>(null),
        dropTargetId = $bindable<string | null>(null),
        dropPosition = $bindable<DropPosition>(null)
    }: Props = $props();

    let isEntrySelected = $derived(selectedEntriesId?.some(eId => eId === entry.id) ?? false)
    let renamingId = $state<string | null>(null);
    let renameValue = $state("");
    let deleteTarget = $state<SharedFile | null>(null);
    let iconPickerEntryId = $state<string | null>(null);
    let iconPickerInitialValue = $state("");
    let walperPickerEntryId = $state<string | null>(null);
    let walperPickerInitialValue = $state("");
    let contextMenu = $state<{ entryId: string; x: number; y: number } | null>(null);
    let entryExpanded = $state(true);

    let isCtrlKeyDown = $state(false);
    
    const contextMenuEntry = $derived(contextMenu ? findFileById($entriesList, contextMenu.entryId) : null);
    const isTarget = $derived(dropTargetId === entry.id);
    const entryHasSubentries = $derived((entry.subentries?.length ?? 0) > 0);

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

    function resetDragState() {
        draggedId = null;
        dropTargetId = null;
        dropPosition = null;
    }

    function closeContextMenu() {
        contextMenu = null;
    }

    async function onEntryClick(clickedEntry: SharedFile) {
        // Open file with rightclick without be in this file
        if (isCtrlKeyDown) {
            const url = new URL($page.url);
            url.searchParams.set("openFileId", clickedEntry.id);
            
            window.open(url, "_blank")
            return;
        }
        
        if (!isSelectable) {
            return;
        }

        if (onSelectFile) {
            await onSelectFile(clickedEntry);
            return;
        }

        await goto("/");
        $selectedFile = clickedEntry;
    }

    async function onEntryKeydown(e: KeyboardEvent, clickedEntry: SharedFile) {
        if (!isSelectable) {
            return;
        }

        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            await onEntryClick(clickedEntry);
        }
    }

    function onEntryContextMenu(e: MouseEvent, clickedEntry: SharedFile) {
        if (!isContextMenuOpenable) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        contextMenu = {
            entryId: clickedEntry.id,
            x: e.clientX,
            y: e.clientY
        };
    }

    function handleDragStart(e: DragEvent, id: string) {
        if (!isDraggable) {
            return;
        }

        draggedId = id;
        if (e.dataTransfer) {
            e.dataTransfer.setData("text/plain", id);
            e.dataTransfer.effectAllowed = "move";
        }
    }

    function handleDragOver(e: DragEvent, draggedOverEntry: SharedFile) {
        if (!isDraggable) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        if (draggedId === draggedOverEntry.id) {
            dropTargetId = null;
            return;
        }

        dropTargetId = draggedOverEntry.id;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const y = e.clientY - rect.top;

        if (y < rect.height * 0.25) {
            dropPosition = "before";
        } else if (y > rect.height * 0.75) {
            dropPosition = "after";
        } else {
            dropPosition = "inside";
        }
    }

    async function handleDrop(e: DragEvent, targetId: string | null) {
        if (!isDraggable) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        if (!draggedId || !targetId) {
            resetDragState();
            return;
        }

        const sourceId = draggedId;
        const nextDropPosition = dropPosition ?? "inside";
        const workspaceId = getCurrentWorkspaceId();

        if (workspaceId) {
            const moveResult = await changeFilePositionRequest(
                workspaceId,
                sourceId,
                targetId,
                nextDropPosition
            );
            if (moveResult) {
                moveEntry(sourceId, targetId, nextDropPosition);
            }
        }

        resetDragState();
    }

    function handleDragEnd() {
        if (!isDraggable) {
            return;
        }

        resetDragState();
    }

    function openRename(targetEntry: SharedFile) {
        if (!ensureActiveWorkspaceSubscription("rename files")) {
            return;
        }

        renamingId = targetEntry.id;
        renameValue = targetEntry.name;
        closeContextMenu();
    }

    async function submitRename(fileId: string) {
        if (!ensureActiveWorkspaceSubscription("rename files")) {
            return;
        }

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

        entriesList.update((list) => updateFileById(list, fileId, (targetEntry) => ({
            ...targetEntry,
            name: nextName
        })));

        renamingId = null;
        renameValue = "";
    }

    function cancelRename() {
        renamingId = null;
        renameValue = "";
    }

    function openDeleteModal(targetEntry: SharedFile) {
        if (!ensureActiveWorkspaceSubscription("delete files")) {
            return;
        }

        deleteTarget = targetEntry;
        closeContextMenu();
    }

    function closeDeleteModal() {
        deleteTarget = null;
    }

    async function confirmDelete() {
        if (!ensureActiveWorkspaceSubscription("delete files")) {
            return;
        }

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

        deleteTarget = null;
    }

    function openIconPicker(targetEntry: SharedFile) {
        if (!ensureActiveWorkspaceSubscription("change file icon")) {
            return;
        }

        iconPickerEntryId = targetEntry.id;
        iconPickerInitialValue = targetEntry.icon ?? "";
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

        entriesList.update((list) => updateFileById(list, entryId, (targetEntry) => ({
            ...targetEntry,
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

        entriesList.update((list) => updateFileById(list, entryId, (targetEntry) => {
            const { icon, ...rest } = targetEntry;
            return rest;
        }));

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

    function openWalperPicker(targetEntry: SharedFile) {
        if (!ensureActiveWorkspaceSubscription("change file wallpaper")) {
            return;
        }

        walperPickerEntryId = targetEntry.id;
        walperPickerInitialValue = targetEntry.walper ?? "";
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

        entriesList.update((list) => updateFileById(list, entryId, (targetEntry) => ({
            ...targetEntry,
            walper: walperValue
        })));

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

        entriesList.update((list) => updateFileById(list, entryId, (targetEntry) => {
            const { walper, ...rest } = targetEntry;
            return rest;
        }));

        closeWalperPicker();
    }

    function toggleEntryExpanded() {
        entryExpanded = !entryExpanded;
    }

    function onWindowClick() {
        closeContextMenu();
    }

    function onWindowKeydown(e: KeyboardEvent) {
        if (e.ctrlKey) isCtrlKeyDown = true;
        
        if (e.key === "Escape") {
            closeContextMenu();
            cancelRename();
            closeDeleteModal();
            closeIconPicker();
            closeWalperPicker();
            return;
        }

        if (!onSelectFile && e.ctrlKey && e.key.toLowerCase() === "r" && $selectedFile?.id === entry.id) {
            e.preventDefault();
            openRename(entry);
        }
    }

    function onWindowKeyUp(e: KeyboardEvent) {
        if (e.ctrlKey) {
            isCtrlKeyDown = false;
        }
    }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown} onkeyup={onWindowKeyUp}/>

<div class="w-full {isTarget && dropPosition === 'before' ? 'border-t-2 border-primary' : ''} {isTarget && dropPosition === 'after' ? 'border-b-2 border-primary' : ''}">
    <div
        class="group/file cursor-pointer flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-base-300 {isTarget && dropPosition === 'inside' ? 'bg-primary/20' : ''} {isEntrySelected ? 'bg-base-300/70' : ''}"
        draggable={isDraggable}
        ondragstart={(e) => handleDragStart(e, entry.id)}
        ondragover={(e) => handleDragOver(e, entry)}
        ondrop={(e) => handleDrop(e, entry.id)}
        ondragend={handleDragEnd}
        onclick={() => onEntryClick(entry)}
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
                        toggleEntryExpanded();
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
                    onclick={(ev) => ev.stopPropagation()}
                    onkeydown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") {
                            void submitRename(entry.id);
                        } else if (e.key === "Escape") {
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
                        void submitRename(entry.id);
                    }}
                    aria-label="Accept rename"
                >
                    <Icon icon="material-symbols:check-rounded" class="text-lg" />
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
                    <Icon icon="material-symbols:close-rounded" class="text-lg" />
                </button>
            </div>
        {:else if !onSelectFile && isNewFileAddable}
            <button
                class="btn btn-ghost btn-square btn-xs opacity-0 transition-opacity group-hover/file:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                onclick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void onNewFile(entry.id);
                }}
                disabled={!$canManageWorkspaceFiles}
                title={!$canManageWorkspaceFiles ? "Active workspace subscription required" : "Add file"}
                aria-label="Add file"
            >
                <Icon icon="material-symbols:add-rounded" class="text-lg" />
            </button>
        {/if}
    </div>

    {#if entryHasSubentries && entryExpanded}
        <div class="ml-4 mt-0.5 min-h-[4px] space-y-0.5 border-l border-base-300 pl-2">
            {#each entry.subentries ?? [] as sub (sub.id)}
                <!-- svelte-ignore svelte_self_deprecated -->
                <svelte:self
                    entry={sub}
                    {selectedEntriesId}
                    depth={depth + 1}
                    {onNewFile}
                    {onSelectFile}
                    {isSelectable}
                    {isDraggable}
                    {isContextMenuOpenable}
                    {isNewFileAddable}
                    bind:draggedId
                    bind:dropTargetId
                    bind:dropPosition
                />
            {/each}
        </div>
    {/if}
</div>

{#if contextMenu && isContextMenuOpenable}
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
                        title={!$canManageWorkspaceFiles ? "Active workspace subscription required" : undefined}
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
                        {contextMenuEntry.icon ? "Change icon" : "Add icon"}
                    </button>
                </li>
                <li>
                    <button
                        onclick={() => openWalperPicker(contextMenuEntry)}
                        disabled={!$canManageWorkspaceFiles}
                        title={!$canManageWorkspaceFiles ? "Active workspace subscription required" : undefined}
                    >
                        {contextMenuEntry.walper ? "Change walper" : "Add walper"}
                    </button>
                </li>
                <li>
                    <button
                        class="text-error"
                        onclick={() => openDeleteModal(contextMenuEntry)}
                        disabled={!$canManageWorkspaceFiles}
                        title={!$canManageWorkspaceFiles ? "Active workspace subscription required" : undefined}
                    >
                        Delete
                    </button>
                </li>
            {/if}
        </ul>
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
        onkeydown={(e) => {
            if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                closeDeleteModal();
            }
        }}
        role="button"
        tabindex="0"
    >
        <div class="flex min-h-full items-center justify-center p-4">
            <UI.Modals.ModalWrapper
                name="Delete File"
                open={deleteTarget !== null}
                closeOnBackdrop={true}
                size="md"
                on:close={() => closeDeleteModal()}
            >
                <UI.Modals.ModalWrapperHeading
                    headingName="Delete file"
                    on:close={() => closeDeleteModal()}
                />

                <div class="pt-2">
                    <p class="text-sm opacity-80">Do you want to delete "{deleteTarget.name}"?</p>
                </div>

                <div class="mt-4 flex justify-end gap-2">
                    <button class="btn btn-ghost" onclick={closeDeleteModal}>Cancel</button>
                    <button class="btn btn-error" onclick={() => void confirmDelete()}>Delete</button>
                </div>
            </UI.Modals.ModalWrapper>
        </div>
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
