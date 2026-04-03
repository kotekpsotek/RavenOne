<script lang="ts">
    import { onMount } from 'svelte';
    import { UI } from '@ravenlens/frontend';
    import { selectedFile } from '$lib/stores/files';
    import { setAlert } from '$lib/utils/alert';
    import Icon from '@iconify/svelte';
    import type { ElementInsertionItem } from '../editorComponents/ui/ElementsListForMenus';
    import OrderedListItem from '$lib/listItems/OrderedListItem.svelte';
    import UnorderedListItem from '$lib/listItems/UnorderedListItem.svelte';
    import TaskListItem from '$lib/listItems/TaskListItem.svelte';
    import { createListId } from '../listItems/utils';
    import { File } from "@ravenlens/shared";
    import { selectedSpikeRoutineDocument, selectedTab, showExecutionResults, tabsAvailable } from '../stores/lists';
    import {
        clampExecutionResultsWidth,
        executionResultsWidth,
        isExecutionResizeHandleHovered,
        isExecutionResultsResizing,
        isResizeHandleHovered,
        isResizing,
        loadTrayHeight,
        onExecutionResizeHandleMouseDown,
        onResizeHandleMouseDown,
        onWindowResize,
        stopExecutionResultsResize,
        stopResize,
        trayHeight,
    } from './resize';
    import RoutinesSpikesExecutionResults from './Routines&SpikesExecutionResults.svelte';
    import ExecutionResultDocumentPreview from './ExecutionResultDocumentPreview.svelte';

    let { isReadOnly = false }: { isReadOnly?: boolean } = $props();

    let isListTrayModalOpen = $state(false);

    // Types
    const listTypes: ElementInsertionItem[] = [
        {
            name: "AI Bullet list",
            icon: "material-symbols:auto-awesome",
            aliases: ["ai", "ai ul", "ai list", "smart bullet"],
            command: (editor, range) => {
                editor.chain().focus().deleteRange(range).toggleBulletList().run();
            }
        },
        {
            name: "AI Ordered list",
            icon: "material-symbols:format-list-numbered-rounded",
            aliases: ["ai", "ai ol", "ai numbered", "smart ordered"],
            command: (editor, range) => {
                editor.chain().focus().deleteRange(range).toggleOrderedList().run();
            }
        },
        {
            name: "AI Checkbox list",
            icon: "material-symbols:checklist-rounded",
            aliases: ["ai", "ai checklist", "ai task", "smart checkbox"],
            command: (editor, range) => {
                editor.chain().focus().deleteRange(range).toggleTaskList().run();
            }
        },
    ];

    const selectedFileId = $derived($selectedFile?.id ?? '');
    const hasItemsInLists = $derived(
        $selectedFile?.lists.some(list => list.items.length > 0) ?? false
    );

    function createId() {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return crypto.randomUUID();
        }

        return `list-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
    }

    function resolveListKind(item: ElementInsertionItem): File.File.ListItemKind {
        if (item.name.toLowerCase().includes('checkbox') || item.name.toLowerCase().includes('task')) {
            return 'task';
        }

        if (item.name.toLowerCase().includes('ordered')) {
            return 'ordered';
        }

        return 'unordered';
    }

    function onSelectListType(item: ElementInsertionItem, event: MouseEvent) {
        if (isReadOnly) {
            setAlert(
                'warning',
                'Active workspace subscription required',
                'Cannot add list points because this workspace has no active subscription.'
            );
            return;
        }

        const listKind = resolveListKind(item);
        const listItem: File.File.EditableListItem = listKind === "task" ?
            {
                id: createListId(),
                text: "",
                depth: 0,
                checked: false
            }
            :
            {
                id: createListId(),
                text: "",
                depth: 0
            };

        selectedFile.update(file => {
            if (!file) {
                return file;
            }

            return {
                ...file,
                lists: [
                    ...file.lists,
                    {
                        id: createId(),
                        kind: listKind,
                        name: item.name,
                        icon: item.icon,
                        items: [listItem]
                    }
                ]
            };
        });

        const triggerElement = event.currentTarget as HTMLElement | null;
        triggerElement?.closest('details')?.removeAttribute('open');
    }

    function removeSpawnedList(spawnedListId: string) {
        if (isReadOnly) {
            return;
        }

        selectedFile.update(file => {
            if (!file) {
                return file;
            }

            return {
                ...file,
                lists: file.lists.filter(spawnedList => spawnedList.id !== spawnedListId)
            };
        });
    }

    function openListTrayModal() {
        isListTrayModalOpen = true;
    }

    function closeListTrayModal() {
        isListTrayModalOpen = false;
    }

    // TODO: Show config
    function onSetupRoutinesExecutionTime() {
        
    }

    // TODO: Show config
    function onSetupSpikesConfig() {

    }

    function onShowExecutionResults() {
        $showExecutionResults = !$showExecutionResults;

        if ($showExecutionResults) {
            $executionResultsWidth = clampExecutionResultsWidth($executionResultsWidth);
        } else {
            stopExecutionResultsResize();
        }
    }

    onMount(() => {
        const unsubscribe = selectedFile.subscribe((file) => {
            loadTrayHeight(file?.id ?? '');
        });

        window.addEventListener("keydown", (ev) => {
            // Toggle execution results
            if (ev.ctrlKey && ev.shiftKey && ev.key === "V") {
                $showExecutionResults = !$showExecutionResults;
            }
        })
        
        return () => {
            unsubscribe();
            stopResize();
            stopExecutionResultsResize();
        };
    });
</script>

<svelte:window onresize={onWindowResize} />

{#snippet listItemsContent()}
    <div class="list-items space-y-2">
        {#each $selectedFile!.lists as spawnedList (spawnedList.id)}
            {#if spawnedList.kind === 'ordered'}
                <OrderedListItem
                    onEmptyList={() => removeSpawnedList(spawnedList.id)}
                    {isReadOnly}
                    {spawnedList}
                />
            {:else if spawnedList.kind === 'unordered'}
                <UnorderedListItem
                    onEmptyList={() => removeSpawnedList(spawnedList.id)}
                    {isReadOnly}
                    {spawnedList}
                />
            {:else}
                <TaskListItem
                    onEmptyList={() => removeSpawnedList(spawnedList.id)}
                    {isReadOnly}
                    {spawnedList}
                />
            {/if}
        {/each}
    </div>
{/snippet}

<div
    class="list-tray relative mt-5 overflow-hidden border-t border-base-300 bg-base-100 {$isResizing ? '' : 'transition-[height] duration-200'}"
    style={`height: ${$trayHeight}px`}
>
    <!-- Stripe to allow position changing -->
    <div
        class="absolute left-0 top-0 z-20 h-1.5 w-full cursor-ns-resize transition-colors {$isResizing || $isResizeHandleHovered ? 'bg-primary/50' : 'bg-transparent hover:bg-primary/30'}"
        title="Drag and drop to resize"
        onmouseenter={() => {
            $isResizeHandleHovered = true;
        }}
        onmouseleave={() => {
            $isResizeHandleHovered = false;
        }}
        onmousedown={onResizeHandleMouseDown}
        role="presentation"
    ></div>

    <!-- Items Height -->
    <div class="h-full overflow-y-auto px-4 py-4 flex flex-col gap-5">
        <!--  -->
        <div class="upper-stripe flex justify-between items-center">
            <div class="left-side">
                <div role="tablist" class="tabs tabs-lift">
                    {#each tabsAvailable as tab (tab)}
                        <button 
                            role="tab"
                            class="tab"
                            class:tab-active={$selectedTab === tab}
                            onclick={selectedTab.onSelectTab(tab)}
                        >
                            {tab}
                        </button>
                    {/each}
                </div>
            </div>

            <div class="right-side">
                <details class="dropdown dropdown-end">
                    <summary 
                        class="btn btn-xs btn-ghost m-1"
                        title="Select list point to add"
                        onclick={(event) => {
                            if (!isReadOnly) {
                                return;
                            }
    
                            event.preventDefault();
                            setAlert(
                                'warning',
                                'Active workspace subscription required',
                                'Cannot add list points because this workspace has no active subscription.'
                            );
                        }}
                    >
                        <Icon icon="material-symbols:add-2-rounded"/>
                    </summary>
        
                    <ul class="menu dropdown-content bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm">
                        {#each listTypes as listType (listType.name)}
                            <li>
                                <button
                                    type="button"
                                    class="flex items-center gap-2"
                                    onclick={(event) => onSelectListType(listType, event)}
                                >
                                    <Icon icon={listType.icon} class="text-base-content/70" />
                                    <span>{listType.name}</span>
                                </button>
                            </li>
                        {/each}
                    </ul>
                </details>

                {#if $selectedTab === "Routines"}
                    <button
                        type="button"
                        class="btn btn-ghost btn-xs"
                        title="Setup execution timer for this routines"
                        onclick={onSetupRoutinesExecutionTime}
                    >
                        <Icon
                            icon="material-symbols:av-timer-rounded"
                        />
                    </button>
                {:else if $selectedTab === "Spikes"}
                    <button
                        type="button"
                        class="btn btn-ghost btn-xs"
                        title="Setup spikes config"
                        onclick={onSetupSpikesConfig}
                    >
                        <Icon
                            icon="material-symbols:webhook-rounded"
                        />
                    </button>
                {/if}
                
                <button
                    type="button"
                    class="show-modal btn btn-xs"
                    title="Open list tray in modal"
                    disabled={!hasItemsInLists}
                    onclick={openListTrayModal}
                >
                    <Icon icon="material-symbols:fullscreen"/>
                </button>

                {#if $selectedTab === "Routines" || $selectedTab === "Spikes"}
                    <button
                        type="button"
                        class="show-modal btn btn-xs"
                        class:btn-outline={!$showExecutionResults}
                        class:btn-info={$showExecutionResults}
                        class:border-gray-300={!$showExecutionResults}
                        class:text-gray-500={!$showExecutionResults}
                        title="(CTRL + Shift + V) Show list of results"
                        onclick={onShowExecutionResults}
                    >
                        <Icon 
                            icon="material-symbols:checklist-rtl-rounded"
                        />
                    </button>
                {/if}
            </div>
        </div>

        <div class="min-h-0 flex-1">
            {#if $showExecutionResults && !isListTrayModalOpen}
                <div id="list-tray-content-panels" class="flex h-full min-h-[220px] min-w-0">
                    <div class="min-w-0 flex-1 overflow-y-auto pr-2">
                        {#if $selectedSpikeRoutineDocument}
                            <ExecutionResultDocumentPreview/>
                        {:else}
                            {@render listItemsContent()}
                        {/if}
                    </div>

                    <button
                        type="button"
                        class="relative mx-1.5 flex w-2 shrink-0 cursor-ew-resize items-stretch justify-center"
                        aria-label="Resize execution results panel"
                        title="Drag to resize execution results"
                        onmouseenter={() => {
                            $isExecutionResizeHandleHovered = true;
                        }}
                        onmouseleave={() => {
                            $isExecutionResizeHandleHovered = false;
                        }}
                        onmousedown={onExecutionResizeHandleMouseDown}
                    >
                        <span class="h-full w-px transition-colors {$isExecutionResultsResizing || $isExecutionResizeHandleHovered ? 'bg-primary/70' : 'bg-base-300'}"></span>
                    </button>

                    <div class="shrink-0 overflow-hidden" style={`width: ${$executionResultsWidth}px`}>
                        <RoutinesSpikesExecutionResults/>
                    </div>
                </div>
            {:else}
                <!-- List with items from list -->
                {#if !isListTrayModalOpen}
                    {@render listItemsContent()}
                {/if}
            {/if}
        </div>
    </div>
</div>

{#if isListTrayModalOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="w-full fixed inset-0 z-[80] bg-black/40" onclick={closeListTrayModal}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="w-full flex min-h-full items-center justify-center p-4" onclick={(event) => event.stopPropagation()}>
            <UI.Modals.ModalWrapper
                name="List tray"
                open={true}
                closeOnBackdrop={true}
                size={{ custom: "max-w-3/4" }}
                on:close={closeListTrayModal}
            >
                <UI.Modals.ModalWrapperHeading
                    headingName="List tray"
                    on:close={closeListTrayModal}
                />

                <div class="max-h-[80vh] p-4 overflow-y-auto pr-1">
                    {@render listItemsContent()}
                </div>
            </UI.Modals.ModalWrapper>
        </div>
    </div>
{/if}
