<script lang="ts">
    import { goto } from "$app/navigation";
    import { UI } from "@ravenlens/frontend";
    import { entriesList, moveEntry, selectedFile, type File } from "$lib/stores/files";
    import Icon from "@iconify/svelte";

    let { isExpanded = false }: { isExpanded?: boolean } = $props();

    let draggedId = $state<string | null>(null);
    let dropTargetId = $state<string | null>(null);
    let dropPosition = $state<'before' | 'after' | 'inside' | null>(null);
    let contextMenu = $state<{ entryId: string; x: number; y: number } | null>(null);
    let renamingId = $state<string | null>(null);
    let renameValue = $state('');
    let deleteTarget = $state<File | null>(null);
    let contextMenuEntry = $derived(contextMenu ? findFileById($entriesList, contextMenu.entryId) : null);

    function onNewFile(targetId: string | null = null) {
        const name = getNextName($entriesList, 'Task');
        const newFile: File = {
            type: "file",
            id: crypto.randomUUID(),
            name,
            createdAt: new Date(),
            content: '',
            createdByAuthorId: 'current-user'
        };

        if (targetId === null) {
            entriesList.update((list) => [...list, newFile]);
            return;
        }

        function addToTarget(items: File[]): File[] {
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

    function getNextName(entries: File[], type: 'Task') {
        const prefix = `Unnamed ${type}`;
        let max = 0;
        
        function scan(items: File[]) {
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
        
        scan($entriesList);
        return `${prefix} ${max + 1}`;
    }

    function handleDragStart(e: DragEvent, id: string) {
        draggedId = id;
        if (e.dataTransfer) {
            e.dataTransfer.setData('text/plain', id);
            e.dataTransfer.effectAllowed = 'move';
        }
    }

    function handleDragOver(e: DragEvent, entry: File) {
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

    function handleDrop(e: DragEvent, targetId: string | null) {
        e.preventDefault();
        e.stopPropagation();
        
        if (draggedId && (targetId !== null || dropPosition === 'inside')) {
            moveEntry(draggedId, targetId, dropPosition || 'inside');
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

    function updateFileById(items: File[], fileId: string, updater: (item: File) => File): File[] {
        return items.map((item) => {
            if (item.id === fileId) {
                return updater(item);
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

    function removeFileById(items: File[], fileId: string): File[] {
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

    function findFileById(items: File[], fileId: string): File | null {
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

    function onEntryContextMenu(e: MouseEvent, entry: File) {
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
        }
    }

    function openRename(entry: File) {
        renamingId = entry.id;
        renameValue = entry.name;
        closeContextMenu();
    }

    function submitRename(entryId: string) {
        const nextName = renameValue.trim();
        if (!nextName) {
            return;
        }

        entriesList.update((list) => updateFileById(list, entryId, (entry) => ({
            ...entry,
            name: nextName
        })));

        renamingId = null;
    }

    function cancelRename() {
        renamingId = null;
        renameValue = '';
    }

    function addIconToFile(entryId: string) {
        const iconName = window.prompt('Enter icon name', 'material-symbols:description-outline-rounded');
        if (!iconName) {
            return;
        }

        entriesList.update((list) => updateFileById(list, entryId, (entry) => ({
            ...entry,
            icon: iconName
        })));

        closeContextMenu();
    }

    function addWalperToFile(entryId: string) {
        const walper = window.prompt('Enter walper value', 'default-walper');
        if (!walper) {
            return;
        }

        entriesList.update((list) => updateFileById(list, entryId, (entry) => ({
            ...entry,
            walper
        })));

        closeContextMenu();
    }

    function openDeleteModal(entry: File) {
        deleteTarget = entry;
        closeContextMenu();
    }

    function closeDeleteModal() {
        deleteTarget = null;
    }

    function confirmDelete() {
        const target = deleteTarget;
        if (!target) {
            return;
        }

        entriesList.update((list) => removeFileById(list, target.id));

        if ($selectedFile?.id === target.id) {
            $selectedFile = undefined;
        }

        deleteTarget = null;
    }

    function onEntryClick(entry: File) {
        return async () => {
            await goto("/");
            $selectedFile = entry;
        }
    }

    async function onEntryKeydown(e: KeyboardEvent, entry: File) {
        if (e.key === 'Enter' || e.key === ' ') {
            await goto("/");
            e.preventDefault();
            $selectedFile = entry;
        }
    }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown} />

{#snippet renderEntry(entry: File, depth = 0)}
    {@const isTarget = dropTargetId === entry.id}
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
                <Icon icon={entry.icon ?? "material-symbols:description-outline-rounded"} class="text-base-content/60 text-xl"/>
                {#if renamingId === entry.id}
                    <input
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
                    class="btn btn-ghost btn-square btn-xs opacity-0 group-hover/file:opacity-100 transition-opacity"
                    onclick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onNewFile(entry.id);
                    }}
                    aria-label="Add file"
                >
                    <Icon icon="material-symbols:add-rounded" class="text-lg"/>
                </button>
            {/if}
        </div>

        {#if entry.subentries?.length}
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
                <li><button onclick={() => openRename(contextMenuEntry)}>Change name</button></li>
                <li><button onclick={() => addIconToFile(contextMenuEntry.id)}>Add icon</button></li>
                <li><button onclick={() => addWalperToFile(contextMenuEntry.id)}>Add walper</button></li>
                <li><button class="text-error" onclick={() => openDeleteModal(contextMenuEntry)}>Delete</button></li>
            {/if}
        </ul>
    </div>
{/if}

{#if isExpanded}
    <div class="flex flex-1 flex-col overflow-hidden bg-base-100/50 p-4 animate-in slide-in-from-left duration-300">
        <div class="mb-4 flex items-center justify-between">
            <h5 class="text-xs font-bold uppercase tracking-wider text-base-content/50">Tasks Explorer</h5>
        
            <div class="flex items-center gap-1">
                <button 
                    onclick={() => onNewFile()}
                    class="btn btn-ghost btn-square btn-xs hover:bg-base-300"
                    title="New File"
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
            {#each $entriesList as entry (entry.id)}
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