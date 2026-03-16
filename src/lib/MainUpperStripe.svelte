<script lang="ts">
    import Icon from "@iconify/svelte";
    import CodeMirror from "svelte-codemirror-editor";
    import { json } from "@codemirror/lang-json";
    import { avaiableModels, getProviderIconifyIcon } from "./config/models";
    import { availableTools, playMode, selectedFile, selectedTools } from "./stores/files";
    import { selectedModel } from "./stores/files";
    import { selectedWorkspace } from "./stores/workspace";
    import { contextSpecification } from "./stores/contextSpec";
    import { mcpConfigurationStore, selectedMcpServers } from "./stores/mcpConfig";
    import { alertState } from "./utils/alert";
    import { editor } from "./stores/editor";
    import { get, writable } from "svelte/store";
    import McpSelectionModal from "./modals/McpSelectionModal.svelte";
    import { UI } from "@ravenlens/frontend";
    import ContextSelectionModal from "./modals/ContextSelectionModal.svelte";
    import PlayModeDropdownContent from "./components/PlayModeDropdownContent.svelte";
    import { playableDocumentsAndListsWithPoints } from "./stores/playModeStore";
    import { isFilePlayable } from "./listItems/utils";
    import SaveFile from "./components/SaveFile.svelte";
    import { downloadUnavaiableModelsRequest, shareFileRequest } from "./files/connections/connections";
    import { File } from "@ravenlens/shared";
    import { canManageWorkspaceFiles } from "./stores/subscription";
    import { browser } from "$app/environment";
    import { isChatSideStripeSelected, isFileListSideStripeSelected, isPointsStripeOpen } from "./stores/selectedSideStripes";

    type DropdownName = "model-settings" | "mcp-tools" | "play-settings" | "share";

    const selectedModelKey = (() => {
        const initialModelKey = avaiableModels[0]?.model ?? "";
        const selectedModelName = writable<string>(initialModelKey);

        if (browser) {
            const model = localStorage.getItem("localSelectedLLM");
            selectedModelName.set(model ?? initialModelKey);
        }

        return {
            ...selectedModelName,
            set(model: string) {
                if (browser) {
                    localStorage.setItem('localSelectedLLM', model);
                }
                
                selectedModelName.set(model ?? initialModelKey);
            }
        }
    })();
    let modelWeights = $state<Record<string, number>>(
        get(selectedModelKey) ? { [get(selectedModelKey)]: 1 } : {}
    );
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
    let generatedShareUrl = $state("");
    let isShareLinkGenerating = $state(false);
    const shareUrl = $derived(generatedShareUrl);

    function cloneContextPayload(payload: File.FileAI.ContextSpecificationPayload): File.FileAI.ContextSpecificationPayload {
        return {
            desktopFiles: [...payload.desktopFiles],
            editorFiles: [...payload.editorFiles],
            networkUrls: [...payload.networkUrls]
        };
    }
    
    const getModelByKey = (key: string) =>
        avaiableModels.find((model) => model.model === key);

    const modelOrderByName = new Map(
        avaiableModels.map((model, index) => [model.model, index])
    );

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

    const currentModel = $derived(getModelByKey($selectedModelKey));

    const getCurrentModelWeight = () => modelWeights[$selectedModelKey] ?? 1;

    function ensureModelWeight(key: string) {
        if (!key || modelWeights[key] !== undefined) {
            return;
        }

        modelWeights = {
            ...modelWeights,
            [key]: 1
        };
    }

    $effect(() => {
        $selectedModel = currentModel;
    });

    function onModelChange(ev: Event) {
        const target = ev.currentTarget as HTMLSelectElement | null;
        const modelNameFromTarget = target?.value;
        const modelNameFromDetail = (ev as CustomEvent<string | undefined>).detail;
        const nextModelKey = modelNameFromTarget ?? modelNameFromDetail ?? get(selectedModelKey);
        ensureModelWeight(nextModelKey);
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
            [$selectedModelKey]: weight
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
        isContextModalOpen = false;
    }

    async function generateShareUrl() {
        const selectedFileLocal = get(selectedFile);
        const selectedWorkspaceLocal = get(selectedWorkspace);
        const workspaceId = selectedWorkspaceLocal?.id?.trim() || selectedFileLocal?.createdByAuthorId?.trim();

        if (!selectedFileLocal?.id || !workspaceId) {
            alertState.set({
                alert: {
                    name: "Cannot share file",
                    description: "Select a file inside a workspace before sharing.",
                    type: "warning"
                },
                timeoutMs: 3_500
            });
            return;
        }

        isShareLinkGenerating = true;
        try {
            const response = await shareFileRequest(workspaceId, selectedFileLocal.id);
            const nextShareUrl = response?.shareUrl?.trim();

            if (nextShareUrl) {
                generatedShareUrl = nextShareUrl;
            }
        } finally {
            isShareLinkGenerating = false;
        }
    }

    async function onShareButtonClick(event: MouseEvent) {
        const summary = event.currentTarget as HTMLElement | null;
        const details = summary?.closest("details");

        if (!(details instanceof HTMLDetailsElement)) {
            return;
        }

        // Generate a fresh link only when opening the dropdown.
        if (!details.open) {
            await generateShareUrl();
        }
    }

    async function copyShareUrl() {
        const nextShareUrl = shareUrl;
        if (!nextShareUrl) {
            alertState.set({
                alert: {
                    name: "Share link unavailable",
                    description: "No share URL is available right now.",
                    type: "warning"
                },
                timeoutMs: 2500
            });
            return;
        }

        try {
            await navigator.clipboard.writeText(nextShareUrl);
            alertState.set({
                alert: {
                    name: "Link copied",
                    description: "Share URL copied to clipboard.",
                    type: "success"
                },
                timeoutMs: 2200
            });
        } catch {
            const textarea = document.createElement("textarea");
            textarea.value = nextShareUrl;
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.append(textarea);
            textarea.select();
            const copied = document.execCommand("copy");
            textarea.remove();

            alertState.set({
                alert: {
                    name: copied ? "Link copied" : "Copy failed",
                    description: copied
                        ? "Share URL copied to clipboard."
                        : "Could not copy the share URL.",
                    type: copied ? "success" : "error"
                },
                timeoutMs: copied ? 2200 : 3500
            });
        }
    }

    function getSocialShareUrl(platform: "facebook" | "x" | "whatsapp" | "telegram" | "linkedin") {
        const encodedUrl = encodeURIComponent(shareUrl);
        if (!encodedUrl) {
            return;
        }

        switch (platform) {
            case "facebook":
                return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
            case "x":
                return `https://x.com/intent/tweet?url=${encodedUrl}`;
            case "whatsapp":
                return `https://wa.me/?text=${encodedUrl}`;
            case "telegram":
                return `https://t.me/share/url?url=${encodedUrl}`;
            case "linkedin":
                return `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
        }
    }

    function openSocialShare(platform: "facebook" | "x" | "whatsapp" | "telegram" | "linkedin") {
        const socialShareUrl = getSocialShareUrl(platform);
        if (!socialShareUrl) {
            return;
        }

        window.open(socialShareUrl, "_blank", "noopener,noreferrer");
    }

    function closeShareDropdown() {
        if (openDropdown === "share") {
            openDropdown = undefined;
        }
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
            }
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
            }
            return;
        }

        if (!$editor) {
            console.error("Cannot play because editor is undefined");
            return;
        }

        const _setupState = await playableDocumentsAndListsWithPoints.playDocument(selectedFileLocal, {
            model: selectedModelLocal,
            tools: $selectedTools,
            context: $contextSpecification,
            // selectedItemMcpServers: useMcpServers ? $selectedMcpServers : [],
            selectedItemPlayMode: $playMode
        });
    }

    function onStopPlaying() {
        if (!$selectedFile) {
            return;
        }

        playableDocumentsAndListsWithPoints.stopPlayingDocument($selectedFile);
    }

    function playingDisabledReason(isFilePlayable: boolean, isSomePointPlaying: boolean) {
        if (!isFilePlayable) {
            return "Playing is disabled since document has no playable node/element; Add some playable AI Node/Element first to make file playable";
        }

        if (isSomePointPlaying) {
            return "Cannot play document since some point is already playing. Stop playing point or wait for its finish"
        }
    }
</script>

<svelte:window onclick={onWindowClick} />

{#if $selectedFile}
    <section
        id="upperstripe"
        class="border-b border-base-300 bg-base-100 flex items-center justify-between px-4 py-2 transition-colors"
    >
        <div class="right-side flex items-center gap-2">
            <SaveFile/>
        </div>

        <div 
            class="left-side flex gap-7 items-center"
        >
            <div class="flex items-center gap-2">
                <div class="join">
                    {#await downloadUnavaiableModelsRequest({ workspaceId: $selectedWorkspace?.id! })}
                        <div>
                            <span class="loading-spinner loading-sm"></span>
                            <span>Loading Models...</span>
                        </div>
                    {:then unavaiableModels}
                        {@const sortedModels = sortModelsByAvailability(unavaiableModels?.allNotAvaiableModels)}
                    
                        <UI.Common.AI.SelectAIModel
                            bind:selectedModel={$selectedModelKey}
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

                    {#if $canManageWorkspaceFiles}
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
                    {/if}
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
                                                onchange={() => ($selectedTools = toggleValue($selectedTools, tool))}
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
                            {@const isFilePlayableLocal = isFilePlayable($selectedFile, $playMode)}
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

                            {#if $canManageWorkspaceFiles}
                                <details
                                    class="dropdown dropdown-end join-item"
                                    open={openDropdown === "play-settings"}
                                    ontoggle={(event) => onDropdownToggle("play-settings", event)}
                                >
                                    <summary class="btn btn-sm rounded-l-none bg-primary/95 text-white/70 shadow-xl border-primary px-1" aria-label="Play settings" title="Play settings">
                                        <Icon icon="material-symbols:settings-outline-rounded" class="w-3 h-3" />
                                    </summary>

                                    <div class="dropdown-content z-[20]">
                                        <PlayModeDropdownContent
                                            selectedPlayMode={$playMode}
                                            onSelect={onSelectPlayMode}
                                        />
                                    </div>
                                </details>
                            {/if}
                        {/if}
                    {/key}
                </div>
            </div>
        
            <details
                class="dropdown dropdown-end"
                open={openDropdown === "share"}
                ontoggle={(event) => onDropdownToggle("share", event)}
            >
                <summary class="btn btn-sm theme-dark:bg-sky-700 bg-sky-400 font-bold text-white" onclick={onShareButtonClick}>
                    <Icon icon="material-symbols:share"/>
                    <span>
                        Share
                    </span>
                </summary>
                
                <div class="dropdown-content z-[20] mr-3 mt-10 w-[17rem] max-w-[88vw]">
                    <div class="relative rounded-2xl border border-base-300 bg-base-100 px-4 pb-4 pt-8 shadow-xl">
                        <div class="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full border border-base-300 bg-base-200 p-3">
                            <Icon icon="material-symbols:link-rounded" class="h-6 w-6" />
                        </div>

                        <button
                            class="btn btn-ghost btn-circle btn-xs absolute right-3 top-3"
                            type="button"
                            aria-label="Close share dialog"
                            title="Close"
                            onclick={closeShareDropdown}
                        >
                            <Icon icon="material-symbols:close-rounded" class="h-4 w-4" />
                        </button>

                        <div class="space-y-1 text-center">
                            <h4 class="text-2xl font-semibold">Share with Team</h4>
                            <p class="mx-auto max-w-[11rem] text-sm opacity-80">Send results of your research to Team!</p>
                        </div>

                        <div class="mt-5 space-y-2">
                            <p class="text-base font-semibold">Share your link</p>
                            <div class="flex h-10 items-center rounded-xl bg-base-200 pl-3 pr-1 gap-1">
                                {#if isShareLinkGenerating}
                                    <span class="loading loading-spinner loading-xs"></span>
                                {/if}
                                <input
                                    class="h-full w-full bg-transparent text-xs outline-none border-none shadow-none active:outline-none focus:border-none"
                                    readonly
                                    value={shareUrl}
                                />
                                <button
                                    class="btn btn-ghost btn-circle btn-xs"
                                    onclick={copyShareUrl}
                                    aria-label="Copy share URL"
                                    title="Copy share URL"
                                    disabled={!shareUrl || isShareLinkGenerating}
                                >
                                    <Icon icon="material-symbols:content-copy-outline-rounded" class="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div class="mt-5 space-y-2">
                            <p class="text-base font-semibold">Share to</p>
                            <div class="grid grid-cols-5 gap-1 text-center">
                                <button class="space-y-1 disabled:opacity-40" type="button" title="Share to Facebook" onclick={() => openSocialShare("facebook")} disabled={!shareUrl || isShareLinkGenerating}>
                                    <span class="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-base-200">
                                        <Icon icon="logos:facebook" class="h-6 w-6" />
                                    </span>
                                    <span class="text-[10px]">Facebook</span>
                                </button>
                                <button class="space-y-1 disabled:opacity-40" type="button" title="Share to X" onclick={() => openSocialShare("x")} disabled={!shareUrl || isShareLinkGenerating}>
                                    <span class="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-base-200">
                                        <Icon icon="simple-icons:x" class="h-4 w-4" />
                                    </span>
                                    <span class="text-[10px]">X</span>
                                </button>
                                <button class="space-y-1 disabled:opacity-40" type="button" title="Share to Whatsapp" onclick={() => openSocialShare("whatsapp")} disabled={!shareUrl || isShareLinkGenerating}>
                                    <span class="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-base-200">
                                        <Icon icon="logos:whatsapp-icon" class="h-6 w-6" />
                                    </span>
                                    <span class="text-[10px]">Whatsapp</span>
                                </button>
                                <button class="space-y-1 disabled:opacity-40" type="button" title="Share to Telegram" onclick={() => openSocialShare("telegram")} disabled={!shareUrl || isShareLinkGenerating}>
                                    <span class="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-base-200">
                                        <Icon icon="logos:telegram" class="h-6 w-6" />
                                    </span>
                                    <span class="text-[10px]">Telegram</span>
                                </button>
                                <button class="space-y-1 disabled:opacity-40" type="button" title="Share to LinkedIn" onclick={() => openSocialShare("linkedin")} disabled={!shareUrl || isShareLinkGenerating}>
                                    <span class="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-base-200">
                                        <Icon icon="logos:linkedin-icon" class="h-6 w-6" />
                                    </span>
                                    <span class="text-[10px]">Linkedin</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </details>

            <div 
                class="openable-list flex gap-2 text-2xl"
            >
                <div
                    class="tooltip tooltip-bottom"
                    data-tip={$isFileListSideStripeSelected ? `Collapse Filebar (Ctrl + .)` : 'Expand Filebar (Ctrl + .)'}
                >
                    <button 
                        class="p-2 rounded-lg cursor-pointer {$isFileListSideStripeSelected ? "bg-base-300/70 text-primary" : "hover:bg-base-300"}"
                        onclick={isFileListSideStripeSelected.onToggle}
                    >
                        <Icon icon="material-symbols:dock-to-right-outline"/>
                    </button>
                </div>
                
                <div
                    class="tooltip tooltip-bottom"
                    data-tip={$isFileListSideStripeSelected ? `Collapse Chatbar (Ctrl + ,)` : 'Expand Chatbar (Ctrl + ,)'}
                >
                    <button
                        class="p-2 rounded-lg cursor-pointer {$isPointsStripeOpen ? "bg-base-300/70 text-primary" : "hover:bg-base-300"}"
                        onclick={isPointsStripeOpen.onToggle}
                    >
                        <Icon icon="material-symbols:dock-to-bottom-outline"/>
                    </button>
                </div>
                
                <div
                    class="tooltip tooltip-bottom"
                    data-tip={$isFileListSideStripeSelected ? `Collapse Chatbar (Ctrl + ,)` : 'Expand Chatbar (Ctrl + ,)'}
                >
                    <button 
                        class="p-2 rounded-lg cursor-pointer {$isChatSideStripeSelected ? "bg-base-300/70 text-primary" : "hover:bg-base-300"}"
                        onclick={isChatSideStripeSelected.onToggle}
                    >
                        <Icon icon="material-symbols:dock-to-left-outline"/>
                    </button>
                </div>
            </div>
        </div>
    </section>

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
{/if}
