<script lang="ts">
    import { onMount } from 'svelte';
    import { get } from 'svelte/store';
    import { browser } from '$app/environment';
    import { UI } from '@ravenlens/frontend';
    import { avaiableModels } from '$lib/config/models';
    import { availableTools, playMode, selectedFile, selectedModel, selectedTools } from '$lib/stores/files';
    import { canManageWorkspaceFiles } from '$lib/stores/subscription';
    import { contextSpecification } from '$lib/stores/contextSpec';
    import { editor } from '$lib/stores/editor';
    import { mcpConfigurationStore, selectedMcpServers } from '$lib/stores/mcpConfig';
    import { playableDocumentsAndListsWithPoints } from '$lib/stores/playModeStore';
    import { alertState, setAlert } from '$lib/utils/alert';
    import Icon from '@iconify/svelte';
    import CodeMirror from 'svelte-codemirror-editor';
    import { json } from '@codemirror/lang-json';
    import type { ElementInsertionItem } from '../editorComponents/ui/ElementsListForMenus';
    import ContextSelectionModal from '$lib/modals/ContextSelectionModal.svelte';
    import McpSelectionModal from '$lib/modals/McpSelectionModal.svelte';
    import OrderedListItem from '$lib/listItems/OrderedListItem.svelte';
    import UnorderedListItem from '$lib/listItems/UnorderedListItem.svelte';
    import TaskListItem from '$lib/listItems/TaskListItem.svelte';
    import { createListId, isFilePlayable } from '../listItems/utils';
    import { File } from "@ravenlens/shared";
    import { selectedSpikeRoutineDocument, selectedTab, showExecutionResults, tabsAvailable, type TabsAvailable } from '../stores/lists';
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
    import ModalScreen from './ModalScreen.svelte';
    import SpikesConfigModal from './SpikesConfigModal.svelte';
    import RoutinesConfigModal from './RoutinesConfigModal.svelte';
    import { selectedWorkspace } from '$lib/stores/workspace';
    import { downloadUnavaiableModelsRequest } from '$lib/files/connections/connections';

    type DropdownName = "model-settings" | "mcp-tools" | "play-settings";
    type TabAIConfiguration = {
        selectedContext: File.FileAI.ContextSpecificationPayload;
        selectedTools: File.FileAI.BrowserToolsUnion[];
        selectedModelKey: string;
    };

    let { isReadOnly = false }: { isReadOnly?: boolean } = $props();

    let isListTrayModalOpen = $state(false);
    let isRoutinesConfigModalOpen = $state(false);
    let isSpikesConfigModalOpen = $state(false);
    const initialModelKey = avaiableModels[0]?.model ?? "";
    const initialSelectedModelKey = browser
        ? (localStorage.getItem("localSelectedLLM") ?? initialModelKey)
        : initialModelKey;
    let selectedModelKey = $state(initialSelectedModelKey);

    let modelWeights = $state<Record<string, number>>({});
    let tabAiConfigurations = $state<Record<TabsAvailable, TabAIConfiguration>>({
        Tasks: {
            selectedContext: cloneContextPayload(get(contextSpecification)),
            selectedTools: cloneTools(get(selectedTools)),
            selectedModelKey: initialSelectedModelKey
        },
        Routines: {
            selectedContext: cloneContextPayload(get(contextSpecification)),
            selectedTools: cloneTools(get(selectedTools)),
            selectedModelKey: initialSelectedModelKey
        },
        Spikes: {
            selectedContext: cloneContextPayload(get(contextSpecification)),
            selectedTools: cloneTools(get(selectedTools)),
            selectedModelKey: initialSelectedModelKey
        }
    });
    let activeTabConfiguration = get(selectedTab);
    let useMcpServers = $state(true);
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

    function cloneTools(tools: File.FileAI.BrowserToolsUnion[]): File.FileAI.BrowserToolsUnion[] {
        return [...tools] as File.FileAI.BrowserToolsUnion[];
    }

    function saveActiveTabConfiguration(tab: TabsAvailable) {
        tabAiConfigurations = {
            ...tabAiConfigurations,
            [tab]: {
                selectedContext: cloneContextPayload($contextSpecification),
                selectedTools: cloneTools($selectedTools),
                selectedModelKey
            }
        };
    }

    function applyTabConfiguration(tab: TabsAvailable) {
        const tabConfiguration = tabAiConfigurations[tab];
        if (!tabConfiguration) {
            return;
        }

        selectedModelKey = tabConfiguration.selectedModelKey || initialModelKey;
        selectedTools.set(cloneTools(tabConfiguration.selectedTools));
        contextSpecification.set(cloneContextPayload(tabConfiguration.selectedContext));

        if (browser) {
            localStorage.setItem("localSelectedLLM", selectedModelKey);
        }
    }

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

    const currentModel = $derived(getModelByKey(selectedModelKey));

    const getCurrentModelWeight = () => modelWeights[selectedModelKey] ?? 1;

    $effect(() => {
        $selectedModel = currentModel;
    });

    function onModelChange(ev: Event) {
        const target = ev.currentTarget as HTMLSelectElement | null;
        const modelNameFromTarget = target?.value;
        const modelNameFromDetail = (ev as CustomEvent<string | undefined>).detail;
        selectedModelKey = modelNameFromTarget ?? modelNameFromDetail ?? selectedModelKey;

        if (browser) {
            localStorage.setItem("localSelectedLLM", selectedModelKey);
        }

        saveActiveTabConfiguration($selectedTab);
    }

    function toggleValue(state: File.FileAI.BrowserToolsUnion[], value: File.FileAI.BrowserToolsUnion): File.FileAI.BrowserToolsUnion[] {
        if (state.includes(value)) {
            return state.filter((entry) => entry !== value) as any;
        }
        return [...state, value] as any;
    }

    function updateCurrentModelWeight(weight: number) {
        modelWeights = {
            ...modelWeights,
            [selectedModelKey]: weight
        };
    }

    function onDropdownToggle(name: DropdownName, event: Event) {
        const target = event.currentTarget as HTMLDetailsElement;

        if (target.open) {
            openDropdown = name;
            return;
        }

        if (openDropdown === name) {
            openDropdown = undefined;
        }
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
        contextModalPayloadDraft = cloneContextPayload($contextSpecification);
        isContextModalOpen = true;
    }

    function onSaveGlobalContext(payload: File.FileAI.ContextSpecificationPayload) {
        contextSpecification.set(payload);
        saveActiveTabConfiguration($selectedTab);
        isContextModalOpen = false;
    }

    function onToggleTool(tool: File.FileAI.BrowserToolsUnion) {
        $selectedTools = toggleValue($selectedTools, tool);
        saveActiveTabConfiguration($selectedTab);
    }

    function syncTabConfigurationOnTabChange(nextTab: TabsAvailable) {
        if (nextTab === activeTabConfiguration) {
            return;
        }

        saveActiveTabConfiguration(activeTabConfiguration);
        applyTabConfiguration(nextTab);
        activeTabConfiguration = nextTab;
    }

    function onSelectPlayMode(mode: File.FileAI.PlayMode) {
        $playMode = mode;
    }

    function openMcpConfigurationEditor() {
        mcpConfigurationDraft = $mcpConfigurationStore;
        mcpConfigurationError = "";
        isMcpConfigModalOpen = true;
        openDropdown = undefined;
    }

    async function onPlay() {
        const selectedModelLocal = get(selectedModel);
        if (!selectedModelLocal) {
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

        await playableDocumentsAndListsWithPoints.playDocument(selectedFileLocal, {
            model: selectedModelLocal,
            tools: $selectedTools,
            context: $contextSpecification,
            selectedItemPlayMode: $playMode
        });
    }

    function onStopPlaying() {
        if (!$selectedFile) {
            return;
        }

        playableDocumentsAndListsWithPoints.stopPlayingDocument($selectedFile);
    }

    function playingDisabledReason(isFilePlayableLocal: boolean, isSomePointPlaying: boolean) {
        if (!isFilePlayableLocal) {
            return "Playing is disabled since document has no playable node/element; Add some playable AI Node/Element first to make file playable";
        }

        if (isSomePointPlaying) {
            return "Cannot play document since some point is already playing. Stop playing point or wait for its finish";
        }
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
            return [] as File.File.SpawnedList[];
        }

        if ($selectedTab === "Routines") {
            return selectedFileLocal.routines ?? [];
        }

        if ($selectedTab === "Spikes") {
            return selectedFileLocal.spikes ?? [];
        }

        return selectedFileLocal.lists ?? [];
    });

    const hasItemsInLists = $derived(
        listsForSelectedTab.some((list: File.File.SpawnedList) => list.items.length > 0)
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

            const itemLocal = {
                id: createId(),
                kind: listKind,
                name: item.name,
                icon: item.icon,
                items: [listItem]
            }
            if ($selectedTab === "Routines") {
                return {
                    ...file,
                    routines: [
                        ...(file.routines ?? []),
                        itemLocal
                    ]
                };
            }

            if ($selectedTab === "Spikes") {
                return {
                    ...file,
                    spikes: [
                        ...(file.spikes ?? []),
                        itemLocal
                    ]
                };
            }

            return {
                ...file,
                lists: [
                    ...(file.lists ?? []),
                    itemLocal
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

            if ($selectedTab === "Routines") {
                return {
                    ...file,
                    routines: (file.routines ?? []).filter(spawnedList => spawnedList.id !== spawnedListId)
                };
            }

            if ($selectedTab === "Spikes") {
                return {
                    ...file,
                    spikes: (file.spikes ?? []).filter(spawnedList => spawnedList.id !== spawnedListId)
                };
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

        const unsubscribeSelectedTab = selectedTab.subscribe((tab) => {
            syncTabConfigurationOnTabChange(tab);
        });

        window.addEventListener("keydown", (ev) => {
            // Toggle execution results
            if (ev.ctrlKey && ev.shiftKey && ev.key === "V") {
                $showExecutionResults = !$showExecutionResults;
            }
        })
        
        return () => {
            unsubscribe();
            unsubscribeSelectedTab();
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
                                bind:selectedModel={selectedModelKey}
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

                        <!-- FIXME: IN MVP nor in begining versions weight -->
                        <!-- {#if $canManageWorkspaceFiles}
                            <details
                                class="dropdown dropdown-end join-item"
                                open={openDropdown === "model-settings"}
                                ontoggle={(event) => onDropdownToggle("model-settings", event)}
                            >
                                <summary class="btn btn-sm h-full rounded-l-none bg-primary/95 text-white/70 border-primary px-1" aria-label="Model Settings" title="Model settings">
                                    <Icon icon="material-symbols:settings-outline-rounded" class="w-3 h-3" />
                                </summary>

                                <div class="dropdown-content p-3 shadow bg-base-200 rounded-box z-[20] w-80 space-y-2">
                                    <div class="flex items-center justify-between text-sm">
                                        <div class="flex items-center gap-2">
                                            {#if $selectedModel}
                                                <Icon icon={getProviderIconifyIcon($selectedModel.provider)} class="w-4 h-4" />
                                            {/if}
                                            <span>{$selectedModel?.model ?? "Select model"}</span>
                                        </div>
                                        <span class="badge badge-outline">Weight: {getCurrentModelWeight().toFixed(2)}</span>
                                    </div>

                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.01"
                                        value={getCurrentModelWeight()}
                                        class="range range-primary"
                                        oninput={(event) =>
                                            updateCurrentModelWeight(Number((event.currentTarget as HTMLInputElement).value))}
                                    />
                                </div>
                            </details>
                        {/if} -->
                    </div>

                    {#if $canManageWorkspaceFiles}
                        <details
                            class="dropdown dropdown-end"
                            open={openDropdown === "mcp-tools"}
                            ontoggle={(event) => onDropdownToggle("mcp-tools", event)}
                        >
                            <summary class="btn btn-sm btn-ghost" title="MCP & tools" aria-label="MCP & tools">
                                <Icon icon="material-symbols:build-outline-rounded" class="w-5 h-5" />
                            </summary>
                            <div class="dropdown-content p-3 shadow bg-base-200 rounded-box z-[20] w-80 space-y-3">
                                <div>
                                    <p class="text-xs uppercase tracking-wide opacity-70 mb-1">Tools</p>
                                    <div class="flex flex-wrap gap-2">
                                        {#each availableTools as tool (tool)}
                                            <label class="label cursor-pointer justify-start gap-2">
                                                <input
                                                    type="checkbox"
                                                    class="checkbox checkbox-primary checkbox-sm"
                                                    checked={$selectedTools.includes(tool)}
                                                    onchange={() => onToggleTool(tool)}
                                                />
                                                <span class="label-text">{tool}</span>
                                            </label>
                                        {/each}
                                    </div>
                                </div>

                                <div>
                                    <p class="text-xs uppercase tracking-wide opacity-70 mb-1">MCP servers access</p>
                                    <label class="label cursor-pointer justify-between mb-1 px-0">
                                        <span class="label-text text-xs">Use MCP servers for tasks</span>
                                        <input type="checkbox" class="toggle toggle-primary toggle-sm" bind:checked={useMcpServers} />
                                    </label>
                                    <div class="rounded border border-base-300 bg-base-100 overflow-auto max-h-48">
                                        <CodeMirror
                                            value={$mcpConfigurationStore}
                                            lang={json()}
                                            readonly={true}
                                            editable={false}
                                            lineNumbers={true}
                                            lineWrapping={false}
                                            styles={{
                                                "&": {
                                                    minWidth: "36rem",
                                                    height: "12rem"
                                                }
                                            }}
                                        />
                                    </div>
                                    <div class="mt-2 flex items-center justify-between">
                                        <span class="text-xs opacity-70">
                                            {useMcpServers
                                                ? `${$selectedMcpServers.length} server(s) configured`
                                                : "MCP servers disabled for tasks"}
                                        </span>
                                        <button class="btn btn-xs btn-primary" onclick={openMcpConfigurationEditor}>Edit</button>
                                    </div>
                                </div>
                            </div>
                        </details>
                    {/if}

                    <button class="btn btn-sm btn-ghost" disabled={!$canManageWorkspaceFiles} onclick={openContextModal} title="Context specification" aria-label="Context specification">
                        <Icon icon="material-symbols:note-stack-outline-rounded" class="w-5 h-5" />
                    </button>

                    {#if $selectedTab === "Tasks"}
                        <div class="join">
                            {#key $playableDocumentsAndListsWithPoints}
                                {#if playableDocumentsAndListsWithPoints.isDocumentPlaying($selectedFile)}
                                    <button 
                                        class="btn btn-sm join-item btn-neutral" 
                                        onclick={onStopPlaying}
                                        title="Stop Playing"
                                    >
                                        <span class="loading loading-spinner loading-xs"></span>
                                        <span>Stop Playing</span>
                                    </button>
                                {:else}
                                    {@const isFilePlayableLocal = $selectedFile ? isFilePlayable($selectedFile, $playMode) : false}
                                    {@const isSomePointPlaying = playableDocumentsAndListsWithPoints.isSomePointPlayingInSomeList($selectedFile)}
                                    {@const isPlayingDisabled = !isFilePlayableLocal || isSomePointPlaying}

                                    <div
                                        class="inline-block"
                                        title={playingDisabledReason(isFilePlayableLocal, isSomePointPlaying)}
                                    >
                                        <button
                                            class="btn btn-sm join-item btn-primary disabled:cursor-not-allowed"
                                            onclick={onPlay}
                                            disabled={isPlayingDisabled || !$canManageWorkspaceFiles}
                                        >
                                            <Icon icon="material-symbols:play-circle-outline-rounded" class="w-5 h-5" />
                                            <span>Play</span>
                                        </button>
                                    </div>
                                {/if}
                            {/key}
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
