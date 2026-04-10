<script lang="ts">
    import { onMount } from 'svelte';
    import { get } from 'svelte/store';
    import { browser } from '$app/environment';
    import { UI } from '@ravenlens/frontend';
    import { avaiableModels } from '$lib/config/models';
    import { selectedFile } from '$lib/stores/files';
    import { canManageWorkspaceFiles } from '$lib/stores/subscription';
    import { editor } from '$lib/stores/editor';
    import { mcpConfigurationStore } from '$lib/stores/mcpConfig';
    import { fetchAuthenticated } from '$lib/utils/fetch';
    import { alertState, setAlert } from '$lib/utils/alert';
    import Icon from '@iconify/svelte';
    import type { ElementInsertionItem } from '../editorComponents/ui/ElementsListForMenus';
    import ContextSelectionModal from '$lib/modals/ContextSelectionModal.svelte';
    import McpSelectionModal from '$lib/modals/McpSelectionModal.svelte';
    import OrderedListItem from '$lib/listItems/OrderedListItem.svelte';
    import UnorderedListItem from '$lib/listItems/UnorderedListItem.svelte';
    import TaskListItem from '$lib/listItems/TaskListItem.svelte';
    import { File } from "@ravenlens/shared";
    import {
        getConfigTargetByTab,
        playingFilesAndTasksListStore,
        selectedSpikeRoutineDocument,
        selectedTab,
        selectedTabContext,
        selectedTabModel,
        showExecutionResults,
        tabsAvailable,
    } from '../stores/lists';
    import type { TabsAvailable } from '../stores/lists';
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
    import RoutinesSpikesExecutionResults from './ExecutionResultsDocumentsList.svelte';
    import ExecutionResultDocumentPreview from './ExecutionResultDocumentPreview.svelte';
    import ModalScreen from './ModalScreen.svelte';
    import SpikesConfigModal from './SpikesConfigModal.svelte';
    import RoutinesConfigModal from './RoutinesConfigModal.svelte';
    import { selectedWorkspace } from '$lib/stores/workspace';
    import { downloadUnavaiableModelsRequest } from '$lib/files/connections/connections';
    import { createListItemId } from '$lib/listItems/utils';
    import { FilePlayConnectionStore } from '$lib/play/connections';
    import { userProfile } from '$lib/stores/user';

    type DropdownName = "model-settings" | "mcp-tools" | "play-settings";

    let { isReadOnly = false }: { isReadOnly?: boolean } = $props();

    let isListTrayModalOpen = $state(false);
    let isRoutinesConfigModalOpen = $state(false);
    let isSpikesConfigModalOpen = $state(false);
    const initialModelKey = avaiableModels[0]?.model ?? "";
    let mcpConfigurationDraft = $state(get(mcpConfigurationStore));
    let mcpConfigurationError = $state("");
    let openDropdown = $state<DropdownName | undefined>(undefined);
    let isContextModalOpen = $state(false);
    let isMcpConfigModalOpen = $state(false);
    let contextModalPayloadDraft = $state<File.FileAI.ContextSpecificationPayload>({
        desktopFiles: [],
        editorFiles: [],
        networkUrls: []
    });
    let isRoutinesAndSpikesConfigurableByUserPermissions = $derived($selectedWorkspace?.userPermissions.includes("manage_files") || $selectedWorkspace?.isOwner ? true : false)
    const getModelByKey = (key: string) =>
        avaiableModels.find((model) => model.model === key);

    const modelOrderByName = new Map(
        avaiableModels.map((model, index) => [model.model, index])
    );

    function cloneContextPayload(payload: File.FileAI.ContextSpecificationPayload): File.FileAI.ContextSpecificationPayload {
        return {
            desktopFiles: [...payload.desktopFiles],
            editorFiles: [...payload.editorFiles],
            networkUrls: [...payload.networkUrls]
        };
    }

    function getModelKeyFromStore(model: File.FileAI.UsedAIModel | undefined): string {
        const modelKey = model?.id?.trim() || model?.name?.trim();
        return modelKey?.length ? modelKey : initialModelKey;
    }

    function createUsedModel(modelKey: string): File.FileAI.UsedAIModel {
        const model = getModelByKey(modelKey);

        if (!model) {
            return {
                id: modelKey,
                name: modelKey,
                provider: {
                    provider: ""
                },
                weight: 1
            };
        }

        return {
            id: model.model,
            name: model.model,
            provider: model.provider,
            weight: 1
        };
    }

    function cloneUsedModel(model: File.FileAI.UsedAIModel): File.FileAI.UsedAIModel {
        return {
            ...model,
            provider: typeof model.provider === 'object'
                ? { ...model.provider }
                : model.provider
        };
    }

    function getConfigSaveScope(): { workspaceId: string; fileId: string; tab: TabsAvailable } | undefined {
        const workspaceId = $selectedWorkspace?.id?.trim() || $selectedFile?.createdByAuthorId?.trim();
        const fileId = $selectedFile?.id?.trim();

        if (!workspaceId || !fileId) {
            return undefined;
        }

        return {
            workspaceId,
            fileId,
            tab: $selectedTab
        };
    }

    async function persistSelectedTabModel(model: File.FileAI.UsedAIModel): Promise<File.FileAI.UsedAIModel | undefined> {
        const saveScope = getConfigSaveScope();
        if (!saveScope) {
            return undefined;
        }

        try {
            const response = await fetchAuthenticated('/files/api/config/model', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    workspaceId: saveScope.workspaceId,
                    fileId: saveScope.fileId,
                    tab: saveScope.tab,
                    model
                })
            });

            if (!response.ok) {
                return undefined;
            }

            const responseBody = await response.json() as {
                model?: File.FileAI.UsedAIModel;
            };

            return responseBody.model;
        }
        catch (error) {
            console.error('Cannot persist selected tab model', error);
            return undefined;
        }
    }

    async function persistSelectedTabContext(
        context: File.FileAI.ContextSpecificationPayload
    ): Promise<File.FileAI.ContextSpecificationPayload | undefined> {
        const saveScope = getConfigSaveScope();
        if (!saveScope) {
            return undefined;
        }

        try {
            const response = await fetchAuthenticated('/files/api/config/context', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    workspaceId: saveScope.workspaceId,
                    fileId: saveScope.fileId,
                    tab: saveScope.tab,
                    context
                })
            });

            if (!response.ok) {
                return undefined;
            }

            const responseBody = await response.json() as {
                context?: File.FileAI.ContextSpecificationPayload;
            };

            return responseBody.context;
        }
        catch (error) {
            console.error('Cannot persist selected tab context', error);
            return undefined;
        }
    }

    const selectedModelKeyFromStore = $derived(getModelKeyFromStore($selectedTabModel));

    function sortModelsByAvailability(disabledModels?: typeof avaiableModels) {
        const unavailableModelNames = new Set((disabledModels ?? []).map((model) => model.model));

        return [...avaiableModels].sort((leftModel, rightModel) => {
            const isLeftUnavailable = unavailableModelNames.has(leftModel.model);
            const isRightUnavailable = unavailableModelNames.has(rightModel.model);

            if (isLeftUnavailable === isRightUnavailable) {
                return (modelOrderByName.get(leftModel.model) ?? 0) - (modelOrderByName.get(rightModel.model) ?? 0);
            }

            return isLeftUnavailable ? 1 : -1;
        });
    }

    async function onModelChange(ev: Event) {
        const target = ev.currentTarget as HTMLSelectElement | null;
        const modelNameFromTarget = target?.value;
        const modelNameFromDetail = (ev as CustomEvent<string | undefined>).detail;
        const nextModelKey = modelNameFromTarget ?? modelNameFromDetail ?? selectedModelKeyFromStore;
        const previousModel = cloneUsedModel(get(selectedTabModel));
        const nextModel = createUsedModel(nextModelKey);

        selectedTabModel.set(nextModel);

        if (browser) {
            localStorage.setItem("localSelectedLLM", nextModelKey);
        }

        const savedModel = await persistSelectedTabModel(nextModel);
        if (!savedModel) {
            selectedTabModel.set(previousModel);
            if (browser) {
                localStorage.setItem("localSelectedLLM", getModelKeyFromStore(previousModel));
            }

            setAlert(
                'error',
                'Cannot save selected model',
                'The selected model could not be persisted for this file and tab.'
            );
            return;
        }

        selectedTabModel.set(savedModel);
    }

    function onWindowClick(event: MouseEvent) {
        if (!openDropdown) {
            return;
        }

        const target = event.target as HTMLElement | null;
        if (!target) {
            return;
        }

        if (target.closest("details.dropdown")) {
            return;
        }

        openDropdown = undefined;
    }

    function openContextModal() {
        contextModalPayloadDraft = cloneContextPayload($selectedTabContext);
        isContextModalOpen = true;
    }

    async function onSaveGlobalContext(payload: File.FileAI.ContextSpecificationPayload): Promise<boolean> {
        const savedContext = await persistSelectedTabContext(payload);
        if (!savedContext) {
            setAlert(
                'error',
                'Cannot save selected context',
                'The selected context could not be persisted for this file and tab.'
            );
            return false;
        }

        const normalizedContext = cloneContextPayload(savedContext);
        selectedTabContext.set(normalizedContext);
        contextModalPayloadDraft = cloneContextPayload(normalizedContext);
        isContextModalOpen = false;

        return true;
    }

    async function onPlay() {
        const selectedModelLocal = get(selectedTabModel);
        if (!selectedModelLocal.id && !selectedModelLocal.name) {
            $alertState = {
                alert: {
                    type: "error",
                    name: "AI Model has to be selected",
                    description: "AI Model has to be selected to play document content"
                },
                timeoutMs: 6_500
            };
            return;
        }

        const selectedFileLocal = get(selectedFile);
        if (!selectedFileLocal) {
            $alertState = {
                alert: {
                    type: "error",
                    name: "File has to be selected",
                    description: "To play the document the document has to be selected"
                },
                timeoutMs: 6_500
            };
            return;
        }

        if (!$editor) {
            console.error("Cannot play because editor is undefined");
            return;
        }

        if (selectedFilePlayingState) {
            if (isSelectedFilePlayingByOtherUser) {
                setAlert(
                    'warning',
                    'Another user is already playing this file',
                    'Wait until current play session is finished before starting a new one.'
                );
                return;
            }

            setAlert(
                'warning',
                'This file is already playing',
                'Wait until your current play session is finished before starting another one.'
            );
            return;
        }

        const isStartedPlaying = await FilePlayConnectionStore.playFile(selectedFileLocal.id);
        if (!isStartedPlaying) {
            setAlert(
                'error',
                'Cannot start playing',
                'The server denied the play request or the connection failed.'
            );
        }
    }

    function onStopPlaying() {
        if (!$selectedFile) {
            return;
        }

        // TODO: Stop playing
    }

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

    const listsForSelectedTab = $derived.by(() => {
        const selectedFileLocal = $selectedFile;
        if (!selectedFileLocal) {
            return [] as File.File.SpawnedList["list"];
        }

        if ($selectedTab === "Routines") {
            return selectedFileLocal.routines.list ?? [];
        }

        if ($selectedTab === "Spikes") {
            return selectedFileLocal.spikes.list ?? [];
        }

        return selectedFileLocal.lists.list ?? [];
    });

    const hasItemsInLists = $derived(
        listsForSelectedTab.some((list) => list.items.length > 0)
    );

    const selectedFilePlayingState = $derived.by(() => {
        const selectedFileId = $selectedFile?.id;
        if (!selectedFileId) {
            return undefined;
        }

        return $playingFilesAndTasksListStore.find((item) => item.fileId === selectedFileId);
    });

    const isSelectedFilePlaying = $derived(Boolean(selectedFilePlayingState));
    const isSelectedFilePlayingByCurrentUser = $derived(Boolean(
        selectedFilePlayingState &&
        $userProfile?.id &&
        selectedFilePlayingState.playByUserId === $userProfile.id
    ));
    const isSelectedFilePlayingByOtherUser = $derived(Boolean(
        selectedFilePlayingState &&
        selectedFilePlayingState.playByUserId !== $userProfile?.id
    ));
    const isTaskEditingLockedByPlaying = $derived($selectedTab === "Tasks" && isSelectedFilePlaying);
    const isPlayButtonDisabled = $derived(isReadOnly || isSelectedFilePlaying || !$selectedFile?.lists.list.length);
    const playButtonTitle = $derived.by(() => {
        if (!$selectedFile) {
            return "Select file to start playing";
        }

        if (isReadOnly) {
            return "Cannot play because this workspace is read-only";
        }

        if (isSelectedFilePlayingByOtherUser) {
            return "Cannot play because another user is currently playing this tasks list";
        }

        if (isSelectedFilePlayingByCurrentUser) {
            return "You are already playing this tasks list";
        }

        return "Play selected tasks list";
    });

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
        const listItem: File.File.EditableListItemItself = listKind === "task" ?
            {
                id: createListItemId(),
                text: "",
                depth: 0,
                checked: false
            }
            :
            {
                id: createListItemId(),
                text: "",
                depth: 0
            };

        selectedFile.update(file => {
            if (!file) {
                return file;
            }

            const itemLocal: File.File.SpawnedList["list"][number] = {
                id: createId(),
                kind: listKind,
                name: item.name,
                icon: item.icon,
                items: [listItem]
            };

            const target = getConfigTargetByTab($selectedTab);
            const targetData = file[target];
            const fallbackContext = cloneContextPayload($selectedTabContext);
            const fallbackModel = createUsedModel(selectedModelKeyFromStore);

            return {
                ...file,
                [target]: {
                    list: [...targetData.list, itemLocal],
                    config: {
                        model: (targetData.config.model.id || targetData.config.model.name)
                            ? targetData.config.model
                            : fallbackModel,
                        context: targetData.config.context.desktopFiles || targetData.config.context.editorFiles || targetData.config.context.networkUrls
                            ? targetData.config.context
                            : fallbackContext
                    }
                }
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

            const target = getConfigTargetByTab($selectedTab);
            const targetData = file[target];

            return {
                ...file,
                [target]: {
                    list: targetData.list.filter(spawnedList => spawnedList.id !== spawnedListId),
                    config: targetData.config
                }
            };
        });
    }

    function openListTrayModal() {
        isListTrayModalOpen = true;
    }

    function closeListTrayModal() {
        isListTrayModalOpen = false;
    }

    function onSetupRoutinesExecutionTime() {
        isRoutinesConfigModalOpen = !isRoutinesConfigModalOpen;
    }

    function onSetupSpikesConfig() {
        isSpikesConfigModalOpen = !isSpikesConfigModalOpen;
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
        const stopFilePlayConnection = FilePlayConnectionStore.start();

        window.addEventListener("keydown", (ev) => {
            // Toggle execution results
            if (ev.ctrlKey && ev.shiftKey && ev.key === "V") {
                $showExecutionResults = !$showExecutionResults;
            }
        })
        
        return () => {
            unsubscribe();
            stopFilePlayConnection();
            stopResize();
            stopExecutionResultsResize();
        };
    });
</script>

<svelte:window onresize={onWindowResize} onclick={onWindowClick} />

{#snippet listItemsContent()}
    <div class="list-items space-y-2">
        {#each listsForSelectedTab as spawnedList (spawnedList.id)}
            {#if spawnedList.kind === 'ordered'}
                <OrderedListItem
                    onEmptyList={() => removeSpawnedList(spawnedList.id)}
                    isReadOnly={isReadOnly || isTaskEditingLockedByPlaying}
                    spawnedList={spawnedList as any}
                />
            {:else if spawnedList.kind === 'unordered'}
                <UnorderedListItem
                    onEmptyList={() => removeSpawnedList(spawnedList.id)}
                    isReadOnly={isReadOnly || isTaskEditingLockedByPlaying}
                    spawnedList={spawnedList as any}
                />
            {:else}
                <TaskListItem
                    onEmptyList={() => removeSpawnedList(spawnedList.id)}
                    isReadOnly={isReadOnly || isTaskEditingLockedByPlaying}
                    spawnedList={spawnedList as any}
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

            <div class="right-side flex gap-2 items-center">
                <div class="flex items-center gap-2 scale-[0.8]">
                    <div class="join">
                        {#await downloadUnavaiableModelsRequest({ workspaceId: $selectedWorkspace?.id! })}
                            <div>
                                <span class="loading-spinner loading-sm"></span>
                                <span>Loading Models...</span>
                            </div>
                        {:then unavaiableModels}
                            {@const sortedModels = sortModelsByAvailability(unavaiableModels?.allNotAvaiableModels)}
                        
                            <UI.Common.AI.SelectAIModel
                                selectedModel={selectedModelKeyFromStore}
                                avaiabaleModels={sortedModels}
                                disabledModels={unavaiableModels?.allNotAvaiableModels}
                                placeholder="Select model"
                                onChange={onModelChange}
                                disabled={!$canManageWorkspaceFiles}
                                selectSize="sm"
                            />
                        {:catch err}
                            <div class="text-xs text-error">
                                <span>Cannot download unavaiable models:</span>
                                {err}
                            </div>
                        {/await}
                    </div>

                    <button class="btn btn-sm btn-ghost" disabled={!$canManageWorkspaceFiles} onclick={openContextModal} title="Context specification" aria-label="Context specification">
                        <Icon icon="material-symbols:note-stack-outline-rounded" class="w-5 h-5" />
                    </button>

                    {#if $selectedTab === "Tasks"}
                        <div class="join">
                            <div class="inline-block">
                                <button
                                    type="button"
                                    class="play-button btn btn-sm join-item btn-primary disabled:cursor-not-allowed"
                                    onclick={onPlay}
                                    disabled={isPlayButtonDisabled}
                                    title={playButtonTitle}
                                    aria-label="Play tasks list"
                                >
                                    <Icon icon="material-symbols:play-circle-outline-rounded" class="w-5 h-5" />
                                    <span>{isSelectedFilePlaying ? 'Playing...' : 'Play'}</span>
                                </button>
                            </div>
                        </div>
                    {/if}
                </div>
            
                <div class="border-l pl-4 border-l-base-300">
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
                            title={isRoutinesAndSpikesConfigurableByUserPermissions ? "Cannot configure routines since you've not required permission" : "Setup execution timer for this routines"}
                            disabled={!isRoutinesAndSpikesConfigurableByUserPermissions}
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
                            title={isRoutinesAndSpikesConfigurableByUserPermissions ? "Cannot configure spikes since you've not required permission" : "Setup spikes config"}
                            disabled={!isRoutinesAndSpikesConfigurableByUserPermissions}
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
    
                    <!-- List with execution results -->
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
                </div>
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

<SpikesConfigModal
    bind:open={isSpikesConfigModalOpen}
/>

<RoutinesConfigModal
    bind:open={isRoutinesConfigModalOpen}
/>

{#if isContextModalOpen}
    <ContextSelectionModal
        bind:open={isContextModalOpen}
        contextPayload={contextModalPayloadDraft}
        onSave={onSaveGlobalContext}
    />
{/if}

<McpSelectionModal
    bind:open={isMcpConfigModalOpen}
    bind:mcpConfigurationDraft
    bind:mcpConfigurationError
/>

{#if isListTrayModalOpen}
    <ModalScreen bind:open={isListTrayModalOpen}>
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
    </ModalScreen>
{/if}
