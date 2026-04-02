<script lang="ts">
    import { onMount } from 'svelte';
    import { UI } from '@ravenlens/frontend';
    import { selectedFile } from '$lib/stores/files';
    import { setAlert } from '$lib/utils/alert';
    import Icon from '@iconify/svelte';
    import type { ElementInsertionItem } from './editorComponents/ui/ElementsListForMenus';
    import OrderedListItem from '$lib/listItems/OrderedListItem.svelte';
    import UnorderedListItem from '$lib/listItems/UnorderedListItem.svelte';
    import TaskListItem from '$lib/listItems/TaskListItem.svelte';
    import { createListId } from './listItems/utils';
    import { File } from "@ravenlens/shared";
    import { fetchAuthenticated } from './utils/fetch';
    import { PUBLIC_SOCKET_IO_PLAY_CONNECTION_URL } from '$env/static/public';
    import { selectedWorkspace } from './stores/workspace';

    let { isReadOnly = false }: { isReadOnly?: boolean } = $props();

    const PANEL_HEIGHT_STORAGE_PREFIX = 'list-tray-height';
    const PANEL_MIN_HEIGHT = 120;
    const PANEL_DEFAULT_HEIGHT = 220;
    const PANEL_MAX_VIEWPORT_RATIO = 0.6;
    
    const RESULTS_PANEL_DEFAULT_WIDTH = 320;
    const RESULTS_PANEL_MIN_WIDTH = 240;
    const RESULTS_PANEL_MIN_LEFT_WIDTH = 260;
    const RESULTS_PANEL_MAX_CONTAINER_RATIO = 0.6;

    let trayHeight = $state(PANEL_DEFAULT_HEIGHT);
    let isResizing = $state(false);
    let isResizeHandleHovered = $state(false);
    let isListTrayModalOpen = $state(false);
    let executionResultsWidth = $state(RESULTS_PANEL_DEFAULT_WIDTH);
    let isExecutionResultsResizing = $state(false);
    let isExecutionResizeHandleHovered = $state(false);

    let startClientY = 0;
    let startPanelHeight = 0;
    let startClientX = 0;
    let startExecutionResultsWidth = 0;

    // Execution results dispaly
    let showExecutionResults = $state(false);
    /** List with selected point timestamps */
    let selectedSpikeRoutineResultDateTimestamps: string[] = $state([]);
    let selectedSpikeRoutineId: string | null = $state(null);
    
    // Tabs Display
    type TabsAvailable = "Tasks" | "Routines" | "Spikes";

    let selectedTab = $state<TabsAvailable>("Tasks");
    const onSelectTab = (tab: TabsAvailable) => {
        return (_ev: Event) => {
            if (tab === "Tasks") {
                showExecutionResults = false;
                stopExecutionResultsResize();
            }

            selectedTab = tab;
        }
    }
        
    const tabsAvailable: TabsAvailable[] = [
        "Tasks",
        "Routines",
        "Spikes"
    ];

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

    function getStorageKey(fileId: string) {
        return `${PANEL_HEIGHT_STORAGE_PREFIX}:${fileId}`;
    }

    function getMaxHeight() {
        if (typeof window === 'undefined') {
            return Number.POSITIVE_INFINITY;
        }

        return Math.floor(window.innerHeight * PANEL_MAX_VIEWPORT_RATIO);
    }

    function clampHeight(height: number) {
        return Math.min(getMaxHeight(), Math.max(PANEL_MIN_HEIGHT, height));
    }

    function saveTrayHeight(fileId: string, height: number) {
        if (typeof window === 'undefined' || !fileId) {
            return;
        }

        localStorage.setItem(getStorageKey(fileId), String(clampHeight(height)));
    }

    function loadTrayHeight(fileId: string) {
        if (typeof window === 'undefined' || !fileId) {
            trayHeight = clampHeight(PANEL_DEFAULT_HEIGHT);
            return;
        }

        const storedHeight = Number(localStorage.getItem(getStorageKey(fileId)));
        if (Number.isFinite(storedHeight) && storedHeight > 0) {
            trayHeight = clampHeight(storedHeight);
            return;
        }

        trayHeight = clampHeight(PANEL_DEFAULT_HEIGHT);
    }

    function onResizeHandleMouseDown(event: MouseEvent) {
        isResizing = true;
        startClientY = event.clientY;
        startPanelHeight = trayHeight;

        window.addEventListener('mousemove', onResizeMouseMove);
        window.addEventListener('mouseup', onResizeMouseUp);

        document.body.classList.add('cursor-ns-resize', 'select-none');
        event.preventDefault();
    }

    function onResizeMouseMove(event: MouseEvent) {
        if (!isResizing) {
            return;
        }

        const deltaY = event.clientY - startClientY;
        trayHeight = clampHeight(startPanelHeight - deltaY);
    }

    function onResizeMouseUp() {
        if (!isResizing) {
            return;
        }

        if (selectedFileId) {
            saveTrayHeight(selectedFileId, trayHeight);
        }

        stopResize();
    }

    function stopResize() {
        isResizing = false;
        window.removeEventListener('mousemove', onResizeMouseMove);
        window.removeEventListener('mouseup', onResizeMouseUp);
        document.body.classList.remove('cursor-ns-resize', 'select-none');
    }

    function onWindowResize() {
        const clampedHeight = clampHeight(trayHeight);
        if (clampedHeight !== trayHeight) {
            trayHeight = clampedHeight;

            if (selectedFileId) {
                saveTrayHeight(selectedFileId, clampedHeight);
            }
        }

        const clampedResultsWidth = clampExecutionResultsWidth(executionResultsWidth);
        if (clampedResultsWidth !== executionResultsWidth) {
            executionResultsWidth = clampedResultsWidth;
        }
    }

    function getResultsPanelMaxWidth() {
        const contentPanelsElement = document.getElementById('list-tray-content-panels');
        const totalWidth = contentPanelsElement?.clientWidth ?? 0;
        if (totalWidth <= 0) {
            return Number.POSITIVE_INFINITY;
        }

        const maxByRatio = Math.floor(totalWidth * RESULTS_PANEL_MAX_CONTAINER_RATIO);
        const maxByLeftPanel = Math.floor(totalWidth - RESULTS_PANEL_MIN_LEFT_WIDTH);
        return Math.max(RESULTS_PANEL_MIN_WIDTH, Math.min(maxByRatio, maxByLeftPanel));
    }

    function clampExecutionResultsWidth(width: number) {
        return Math.min(getResultsPanelMaxWidth(), Math.max(RESULTS_PANEL_MIN_WIDTH, width));
    }

    function onExecutionResizeHandleMouseDown(event: MouseEvent) {
        if (!showExecutionResults) {
            return;
        }

        isExecutionResultsResizing = true;
        startClientX = event.clientX;
        startExecutionResultsWidth = executionResultsWidth;

        window.addEventListener('mousemove', onExecutionResizeMouseMove);
        window.addEventListener('mouseup', onExecutionResizeMouseUp);
        document.body.classList.add('cursor-ew-resize', 'select-none');
        event.preventDefault();
    }

    function onExecutionResizeMouseMove(event: MouseEvent) {
        if (!isExecutionResultsResizing) {
            return;
        }

        const deltaX = event.clientX - startClientX;
        executionResultsWidth = clampExecutionResultsWidth(startExecutionResultsWidth - deltaX);
    }

    function onExecutionResizeMouseUp() {
        stopExecutionResultsResize();
    }

    function stopExecutionResultsResize() {
        isExecutionResultsResizing = false;
        window.removeEventListener('mousemove', onExecutionResizeMouseMove);
        window.removeEventListener('mouseup', onExecutionResizeMouseUp);
        document.body.classList.remove('cursor-ew-resize', 'select-none');
    }

    // TODO: Show config
    function onSetupRoutinesExecutionTime() {
        
    }

    // TODO: Show config
    function onSetupSpikesConfig() {

    }

    function onShowExecutionResults() {
        showExecutionResults = !showExecutionResults;

        if (showExecutionResults) {
            executionResultsWidth = clampExecutionResultsWidth(executionResultsWidth);
        } else {
            stopExecutionResultsResize();
        }
    }

    async function donwloadResults() {
        const mode = selectedTab.toLocaleLowerCase();
        const fetchResult = await fetchAuthenticated(
            `${PUBLIC_SOCKET_IO_PLAY_CONNECTION_URL}/routines-spikes/${mode}/download-results`,
            {
                method: "POST",
                headers: {
                    'Content-Type': "application/json"
                },
                body: JSON.stringify({
                    fileId: $selectedFile?.id,
                    workspaceId: $selectedWorkspace?.id
                })
            }
        );

        if (fetchResult) {
            const results = await fetchResult.json() as File.RoutinesSpikes.FrontendDownloadResultObject[];

            return results.map(result => ({
                ...result,
                date: new Date(result.date)
            }))
        }

        return [];
    }

    onMount(() => {
        const unsubscribe = selectedFile.subscribe((file) => {
            loadTrayHeight(file?.id ?? '');
        });

        window.addEventListener("keydown", (ev) => {
            // Toggle execution results
            if (ev.ctrlKey && ev.shiftKey && ev.key === "V") {
                showExecutionResults = !showExecutionResults;
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

<!--
1. Show the results tray [v]
2. [v] Download execution result from backend and download with {#await :then :catch} block 
    - show the loading spinner once is loading
    - show the list once clicked

TODO:
3. Clicked item has to show the generated documents below and unclicked has to hide -> multiple lists can be clicked simulatenously
4. Clicked document instead of #listItemContent shows the document while upper stripe has the arrow left to go go back
    - clicked document on Results list is shown as clicked
    ! Only one document can be clicked atime
5. Switching among files causes to close the selected document
-->
{#snippet executionResults()}
    <section class="execution-results h-full overflow-y-auto bg-base-100 p-4">
        <div class="mb-4 flex items-center gap-2 border-b border-base-300 pb-3">
            <Icon icon="material-symbols:checklist-rtl-rounded" class="text-lg text-base-content" />
            <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content">Execution Results</h3>
        </div>

        {#await donwloadResults()}
            <div class="flex items-center justify-center w-full h-full">
                <span class="loading-spinner loading-sm"></span>
                <span>Loading Results...</span>
            </div>
        {:then results}
            <div class="space-y-2 h-full">
                {#if results.length}
                    {#each results as result}
                        <button
                            type="button"
                            class="w-full rounded-md px-2 py-2 text-left text-sm text-base-content/70 transition-colors hover:bg-base-200"
                        >
                            23.03.2026 (Title default is date)
                        </button>
                    {/each}
                {:else}
                    <div class="flex items-center text-sm justify-center w-full h-full">
                        <span>There isn't any execution result</span>
                    </div>
                {/if}
            </div>
        {:catch err}
            <div class="flex items-center justify-center w-full h-full">
                <p class="text-error">Cannot load results</p>
            </div>
        {/await}
    </section>
{/snippet}

<div
    class="list-tray relative mt-5 overflow-hidden border-t border-base-300 bg-base-100 {isResizing ? '' : 'transition-[height] duration-200'}"
    style={`height: ${trayHeight}px`}
>
    <!-- Stripe to allow position changing -->
    <div
        class="absolute left-0 top-0 z-20 h-1.5 w-full cursor-ns-resize transition-colors {isResizing || isResizeHandleHovered ? 'bg-primary/50' : 'bg-transparent hover:bg-primary/30'}"
        title="Drag and drop to resize"
        onmouseenter={() => {
            isResizeHandleHovered = true;
        }}
        onmouseleave={() => {
            isResizeHandleHovered = false;
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
                            class:tab-active={selectedTab === tab}
                            onclick={onSelectTab(tab)}
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

                {#if selectedTab === "Routines"}
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
                {:else if selectedTab === "Spikes"}
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

                {#if selectedTab === "Routines" || selectedTab === "Spikes"}
                    <button
                        type="button"
                        class="show-modal btn btn-xs"
                        class:btn-outline={!showExecutionResults}
                        class:btn-info={showExecutionResults}
                        class:border-gray-300={!showExecutionResults}
                        class:text-gray-500={!showExecutionResults}
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
            {#if showExecutionResults && !isListTrayModalOpen}
                <div id="list-tray-content-panels" class="flex h-full min-h-[220px] min-w-0">
                    <div class="min-w-0 flex-1 overflow-y-auto pr-2">
                        {@render listItemsContent()}
                    </div>

                    <button
                        type="button"
                        class="relative mx-1.5 flex w-2 shrink-0 cursor-ew-resize items-stretch justify-center"
                        aria-label="Resize execution results panel"
                        title="Drag to resize execution results"
                        onmouseenter={() => {
                            isExecutionResizeHandleHovered = true;
                        }}
                        onmouseleave={() => {
                            isExecutionResizeHandleHovered = false;
                        }}
                        onmousedown={onExecutionResizeHandleMouseDown}
                    >
                        <span class="h-full w-px transition-colors {isExecutionResultsResizing || isExecutionResizeHandleHovered ? 'bg-primary/70' : 'bg-base-300'}"></span>
                    </button>

                    <div class="shrink-0 overflow-hidden" style={`width: ${executionResultsWidth}px`}>
                        {@render executionResults()}
                    </div>
                </div>
            {:else}
                <!-- List with items from list -->
                {#if !isListTrayModalOpen}
                    {@render listItemsContent()}
                {/if}

                <!-- Execution results showing -->
                {#if showExecutionResults}
                    {@render executionResults()}
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
