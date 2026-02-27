<script lang="ts">
    import Icon from "@iconify/svelte";
    import favicon from '$lib/assets/favicon.svg';
    import { onMount } from 'svelte';
    import { entriesList, type File, type Folder, moveEntry, selectedFile } from "./stores/files";
    import { user } from "./stores/user";
    import { UI } from "@ravenlens/frontend"
    import { theme } from "./stores/theme";
    import { avaiableWorkspaces, isAddNewWorkspaceBtnDisabled, isWorkspaceSelectionOpen, selectedWorkspace } from "./stores/workspace";
    import { Workspace } from "@ravenlens/shared";
    import { State } from "@ravenlens/frontend";

    let isExpanded = $state(false);
    let modalFolderTarget: Folder | null = $state(null);

    onMount(() => {
        const storedTheme = localStorage.getItem('theme') as 'dark' | 'light';
        if (storedTheme) {
            $theme = storedTheme;
        } else {
            const hasdarkAttr = document.documentElement.getAttribute('data-theme') === 'black';
            $theme = hasdarkAttr ? 'dark' : 'light';
        }
        
        applyTheme();
    });

    function toggleTheme() {
        $theme = $theme === 'dark' ? 'light' : 'dark';
        applyTheme();
    }

    function applyTheme() {
        // Set the primary theme attribute used by DaisyUI
        const daisyTheme = $theme === 'dark' ? 'black' : 'light';
        document.documentElement.setAttribute('data-theme', daisyTheme);
        localStorage.setItem('theme', $theme);
        
        if ($theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }

    let draggedId = $state<string | null>(null);
    let dropTargetId = $state<string | null>(null);
    let dropPosition = $state<'before' | 'after' | 'inside' | null>(null);

    function onSearch() {
        console.log('Open search palette');
    }

    function onToggleSidebar() {
        isExpanded = !isExpanded;
    }

    function onEntryClick(entry: File | Folder) {
        return () => {
            if (entry.type === "file") {
                $selectedFile = entry;
            }
            else if (entry.type === "folder") {
                // Folder selection logic could go here
            }
        }
    }

    function getNextName(entries: (File | Folder)[], type: 'Task' | 'Folder') {
        const prefix = `Unnamed ${type}`;
        let max = 0;
        
        function scan(items: (File | Folder)[]) {
            for (const item of items) {
                const match = item.name.match(new RegExp(`^${prefix} (\\d+)$`));
                if (match) {
                    const num = parseInt(match[1]);
                    if (num > max) max = num;
                }
                if (isFolder(item)) scan(item.subentries);
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

    function handleDragOver(e: DragEvent, entry: File | Folder) {
        e.preventDefault();
        e.stopPropagation();
        
        if (draggedId === entry.id) {
            dropTargetId = null;
            return;
        }

        dropTargetId = entry.id;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const y = e.clientY - rect.top;
        
        if (isFolder(entry)) {
            // Folders have 3 zones: top 25% (before), bottom 25% (after), middle 50% (inside)
            if (y < rect.height * 0.25) {
                dropPosition = 'before';
            } else if (y > rect.height * 0.75) {
                dropPosition = 'after';
            } else {
                dropPosition = 'inside';
            }
        } else {
            // Files have 2 zones: top 50% (before), bottom 50% (after)
            if (y < rect.height * 0.5) {
                dropPosition = 'before';
            } else {
                dropPosition = 'after';
            }
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

    function onNewFile(target: Folder | null = null) {
        const name = getNextName($entriesList, 'Task');
        const newFile: File = {
            type: "file",
            id: crypto.randomUUID(),
            name,
            createdAt: new Date(),
            content: '',
            createdByAuthorId: 'current-user'
        };

        if (target) {
            target.subentries = [...target.subentries, newFile];
            entriesList.update(l => [...l]); // Trigger reactivity
        } else {
            entriesList.update(l => [...l, newFile]);
        }
    }

    function onNewFolder(target: Folder | null = null) {
        const name = getNextName($entriesList, 'Folder');
        const newFolder: Folder = {
            type: "folder",
            id: crypto.randomUUID(),
            name,
            createdAt: new Date(),
            subentries: [],
            createdByAuthorId: 'current-user'
        };

        if (target) {
            target.subentries = [...target.subentries, newFolder];
            entriesList.update(l => [...l]); // Trigger reactivity
        } else {
            entriesList.update(l => [...l, newFolder]);
        }
    }

    function openAddModal(folder: Folder) {
        modalFolderTarget = folder;
        const modal = document.getElementById('add_modal') as HTMLDialogElement;
        modal?.showModal();
    }

    // Snippet for recursive entry rendering
    function isFolder(entry: File | Folder): entry is Folder {
        return entry.type === "folder";
    }

    //
    function onToggleWorkspaceSelection() {
        $isWorkspaceSelectionOpen = !$isWorkspaceSelectionOpen;
    }

    //
    function onOpenWorkspaceSettings() {

    }

    function onHelpMaterials() {

    }
</script>

<dialog id="add_modal" class="modal modal-bottom sm:modal-middle">
    <div class="modal-box bg-base-200">
        <h3 class="text-lg font-bold">Add to {modalFolderTarget?.name}</h3>
        <p class="py-4 font-medium opacity-60">What would you like to create?</p>
        <div class="flex gap-4 justify-center">
            <button 
                class="btn btn-primary flex-1 gap-2" 
                onclick={() => { 
                    if (modalFolderTarget) onNewFile(modalFolderTarget);
                    (document.getElementById('add_modal') as HTMLDialogElement).close();
                }}
            >
                <Icon icon="material-symbols:note-add-outline-rounded" class="text-xl"/>
                New Task
            </button>
            <button 
                class="btn btn-secondary flex-1 gap-2" 
                onclick={() => { 
                    if (modalFolderTarget) onNewFolder(modalFolderTarget);
                    (document.getElementById('add_modal') as HTMLDialogElement).close();
                }}
            >
                <Icon icon="material-symbols:create-new-folder-outline-rounded" class="text-xl"/>
                New Folder
            </button>
        </div>
        <div class="modal-action">
            <form method="dialog">
                <button class="btn btn-sm btn-ghost">Cancel</button>
            </form>
        </div>
    </div>
</dialog>

{#snippet renderEntry(entry: File | Folder, depth = 0)}
    {@const isTarget = dropTargetId === entry.id}
    {#if isFolder(entry)}
        <details 
            class="group/folder w-full {isTarget && dropPosition === 'before' ? 'border-t-2 border-primary' : ''} {isTarget && dropPosition === 'after' ? 'border-b-2 border-primary' : ''}" 
            open
            draggable="true"
            ondragstart={(e) => handleDragStart(e, entry.id)}
            ondragover={(e) => handleDragOver(e, entry)}
            ondrop={(e) => handleDrop(e, entry.id)}
            ondragend={handleDragEnd}
        >
            <summary class="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-base-300 list-none {isTarget && dropPosition === 'inside' ? 'bg-primary/20' : ''}">
                <div class="flex items-center gap-2 overflow-hidden">
                    <Icon icon="material-symbols:keyboard-arrow-right-rounded" class="text-base transition-transform group-open/folder:rotate-90 flex-none"/>
                    <Icon icon="material-symbols:folder-open-outline-rounded" class="hidden group-open/folder:block text-primary text-xl flex-none"/>
                    <Icon icon="material-symbols:folder-outline-rounded" class="block group-open/folder:hidden text-primary text-xl flex-none"/>
                    <span class="text-sm font-medium truncate">{entry.name}</span>
                </div>
                <!-- Plus Icon for Folders -->
                <button 
                    class="btn btn-ghost btn-square btn-xs opacity-0 group-hover/folder:opacity-100 transition-opacity"
                    onclick={(e) => { e.preventDefault(); e.stopPropagation(); openAddModal(entry); }}
                    aria-label="Add to folder"
                >
                    <Icon icon="material-symbols:add-rounded" class="text-lg"/>
                </button>
            </summary>
            <div class="ml-4 border-l border-base-300 pl-2 mt-0.5 space-y-0.5 min-h-[4px]">
                {#each entry.subentries as sub (sub.id)}
                    {@render renderEntry(sub, depth + 1)}
                {/each}
            </div>
        </details>
    {:else}
        <button 
            class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-base-300 {isTarget && dropPosition === 'before' ? 'border-t-2 border-primary' : ''} {isTarget && dropPosition === 'after' ? 'border-b-2 border-primary' : ''} {$selectedFile?.name === entry.name ? 'bg-base-400' : ''}"
            draggable="true"
            ondragstart={(e) => handleDragStart(e, entry.id)}
            ondragover={(e) => handleDragOver(e, entry)}
            ondrop={(e) => handleDrop(e, entry.id)}
            ondragend={handleDragEnd}
            onclick={onEntryClick(entry)}
        >
            <div class="flex items-center gap-2">
                <Icon icon="material-symbols:description-outline-rounded" class="text-base-content/60 text-xl"/>
                <span class="text-sm truncate">{entry.name}</span>
            </div>
        </button>
    {/if}
{/snippet}

<aside 
    class="flex h-full flex-col border-r border-base-300 bg-base-100 transition-all duration-300 {isExpanded ? 'w-80' : 'w-14'}"
>
    <div class="flex flex-1 overflow-hidden">
        <!-- Narrow Stripe (Activity Bar) -->
        <div class="flex w-14 flex-none flex-col items-center py-4 border-r border-base-300">
            <div class="mb-4 flex flex-col items-center gap-6">
                <!-- Workspace selection -->
                <div class="tooltip tooltip-right" data-tip="RavenOne">
                    <button 
                        class="flex h-10 w-10 p-2 items-center justify-center rounded-xl bg-primary/10 transition-all hover:scale-105 hover:bg-primary/20"
                        class:isSelected={$isWorkspaceSelectionOpen}
                        onclick={onToggleWorkspaceSelection}
                    >
                        <UI.Workspace.WorkspaceProfile
                            imageUrl={$selectedWorkspace?.imageUrl}
                            workspaceName={$selectedWorkspace?.name ?? ""}
                        />
                    </button>
                </div>

                <!-- Quick Actions -->
                <div class="flex flex-col items-center gap-3">
                    <div class="tooltip tooltip-right" data-tip="Search (Ctrl+P)">
                        <button
                            onclick={onSearch}
                            class="btn btn-ghost btn-square btn-sm rounded-lg text-base-content/70 hover:bg-base-300 hover:text-primary active:scale-95"
                            aria-label="Search"
                        >
                            <Icon icon="material-symbols:search-rounded" class="text-xl"/>
                        </button>
                    </div>
                    
                    <div class="tooltip tooltip-right" data-tip={isExpanded ? 'Collapse Sidebar' : 'Expand Tasks Explorer'}>
                        <button
                            onclick={onToggleSidebar}
                            class="btn btn-ghost btn-square btn-sm rounded-lg {isExpanded ? 'bg-base-100 text-primary' : 'text-base-content/70'} hover:bg-base-300 hover:text-primary active:scale-95 transition-colors"
                            aria-label="Toggle sidebar"
                        >
                            <Icon icon="material-symbols:thumbnail-bar-outline" class="text-xl"/>
                        </button>
                    </div>
                </div>
            </div>

            <div class="mt-auto flex flex-col items-center gap-4">
                <div class="tooltip tooltip-right" data-tip={$theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
                    <button
                        onclick={toggleTheme}
                        class="btn btn-ghost btn-square btn-sm relative overflow-hidden rounded-lg text-base-content/70 hover:bg-base-300 hover:text-primary active:scale-95 transition-all"
                        aria-label="Toggle theme"
                    >
                        {#if $theme === 'dark'}
                            <div class="flex items-center justify-center animate-in zoom-in-50 duration-300">
                                <Icon icon="material-symbols:wb-sunny-outline-rounded" class="text-xl"/>
                            </div>
                        {:else}
                            <div class="flex items-center justify-center animate-in zoom-in-50 duration-300">
                                <Icon icon="material-symbols:dark-mode-outline-rounded" class="text-xl"/>
                            </div>
                        {/if}
                    </button>
                </div>

                <div class="flex flex-col gap-2">
                    <div class="tooltip tooltip-right" data-tip="Help Materials">
                        <button
                            class="btn btn-ghost btn-square btn-sm relative overflow-hidden rounded-lg text-base-content/70 hover:bg-base-300 hover:text-primary active:scale-95 transition-all"
                            onclick={onHelpMaterials}
                        >
                            <Icon 
                                icon="material-symbols:help-outline-rounded"
                                class="text-xl"
                            />
                        </button>
                    </div>

                    <div class="tooltip tooltip-right" data-tip="Workspace Settings">
                        <button 
                            class="btn btn-ghost btn-square btn-sm relative overflow-hidden rounded-lg text-base-content/70 hover:bg-base-300 hover:text-primary active:scale-95 transition-all"
                            onclick={onOpenWorkspaceSettings}
                        >
                            <Icon 
                                icon="material-symbols:settings-outline-rounded"
                                class="text-xl"
                            />
                        </button>
                    </div>
                </div>

                {#if $user}
                    <div class="tooltip tooltip-right" data-tip="{$user.name} ({$user.email})">
                        <button class="avatar placeholder group cursor-pointer transition-all hover:scale-105 active:scale-95">
                            <div class="w-10 rounded-xl bg-neutral text-neutral-content ring-primary/30 ring-offset-base-200 transition-all group-hover:ring group-hover:ring-offset-2">
                                <img src="{$user.profileImgURL}" alt="{$user.name}" />
                            </div>
                        </button>
                    </div>
                {/if}
            </div>
        </div>

        <!-- Expansion Panel (Explorer) -->
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
            
                        <button 
                            onclick={() => onNewFolder()}
                            class="btn btn-ghost btn-square btn-xs hover:bg-base-300"
                            title="New Folder"
                        >
                            <Icon icon="material-symbols:create-new-folder-outline-rounded" class="text-lg"/>
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
    </div>
</aside>

<style>
    @reference "../app.css";

    .isSelected {
        @apply scale-115 bg-primary/40;
    }
</style>
