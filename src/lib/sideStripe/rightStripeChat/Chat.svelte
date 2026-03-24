<script lang="ts">
    import ModelsListSelection from "$lib/ai/ModelsListSelection.svelte";
    import { selectedModelKey } from "$lib/ai/model";
    import { avaiableModels } from "$lib/config/models";
    import McpServerSelectionModal from "$lib/mcp/components/McpServerSelectionModal.svelte";
    import ContextSelectionModal from "$lib/modals/ContextSelectionModal.svelte";
    import {
        SelectedAnswerFromChatContext,
        activeChat,
        chatStripeTabsOfWorkspaceFile,
        editorAIChat,
        isLoadedChatsOfWorkspaceFileLoading,
        processingChatsOfWorkspaceFile,
        rightSideStripeChat,
        selectedChatAnswerIds
    } from "$lib/stores/aiRightSideChat";
    import { selectedFile, selectedModel } from "$lib/stores/files";
    import { isPointsStripeOpen } from "$lib/stores/selectedSideStripes";
    import { selectedWorkspace } from "$lib/stores/workspace";
    import { fetchAuthenticated } from "$lib/utils/fetch";
    import Icon from "@iconify/svelte";
    import { File } from "@ravenlens/shared";
    import type { AI } from "@ravenlens/shared";
    import type { AIChatMode, ChatTab } from "@ravenlens/shared/chat-ai/frontend";
    import type {
        AIChatModel,
        MessageOutput,
        MessageUserPrompt,

        SelectedTextRangeContext

    } from "@ravenlens/shared/chat-ai/backend/schema";
    import { CHAT_MODES, chatLayoutStore as rightSideStripeChatLayout, type ChatModeValue } from "./config";
    import { derived, get, writable } from "svelte/store";
    import { onMount, tick } from "svelte";
    import UserPrompt from "./bubbles/UserPrompt.svelte";
    import AIResponse from "./bubbles/AIResponse.svelte";

    let {
        isModeSelectingTrayOpen = $bindable(false),
        isMermaidModeSelectionTrayOpen = $bindable(false)
    }: {
        isModeSelectingTrayOpen: boolean;
        isMermaidModeSelectionTrayOpen: boolean;
    } = $props();

    // Types
    type ContextSpecificationPayload = File.FileAI.ContextSpecificationPayload;
    type ChatMessage = ChatTab["messages"][number];
    type ChatPromptMessage = Extract<ChatMessage, { messageType: "message-user-prompt" }>;
    type ChatOutputMessage = Extract<ChatMessage, { messageType: "message-user-output" }>;
    type ChatConversationEntry = {
        prompt: ChatPromptMessage;
        outputs: ChatOutputMessage[];
        promptIndex: number;
        key: string;
    };

    interface MCPServersSpec {
        mcpServers: Record<string, unknown>;
    }

    // State
    const displayContextForMessages = writable<string[]>([]);
    const selectedMCPServerNames = writable<string[]>([]);
    
    let textContent = $state("");
    let isSelectedTextPreviewOpen = $state(true);
    let mouseIsOnPreviewSelectedText = $state<{ from: number; to: number } | null>(null);
    let composerResetKey = $state(0);
    let composerTextareaElement = $state<HTMLTextAreaElement | null>(null);
    let chatHistoryElement = $state<HTMLDivElement | null>(null);

    let bottomInteractions: HTMLDivElement | null = null;

    let downloadMCPServersSpecification = $state<MCPServersSpec>({ mcpServers: {} });
    let isMCPServersSelectionOpen = $state(false);
    let isContextSelectionModalOpen = $state(false);
    let isMCPSpecificationAvailableForWorkspace = $derived(getMCPServersList(downloadMCPServersSpecification).length > 0)
    let selectedFileContextPayload = $state<ContextSpecificationPayload>(createEmptyContextPayload());
    let contextModalSelectedChatId = $state<string | null>(null);
    let isActiveChatProcessing = $derived(Boolean($activeChat?.id && $processingChatsOfWorkspaceFile[$activeChat.id]));
        
    let chatConversations = $derived($activeChat ? getConversationEntries($activeChat) : []);
    let isMessagingActive = $derived(Boolean($selectedFile && !$rightSideStripeChat.isLoading && $rightSideStripeChatLayout.isOpen));

    // Until functions
    function updateHistoryBottomPadding() {
        if (!chatHistoryElement || !bottomInteractions) {
            return;
        }

        chatHistoryElement.style.paddingBottom = `${bottomInteractions.clientHeight}px`;
    }
    
    function isPromptMessage(message: ChatMessage): message is ChatPromptMessage {
        return message.messageType === "message-user-prompt";
    }

    function isOutputMessage(message: ChatMessage): message is ChatOutputMessage {
        return message.messageType === "message-user-output";
    }

    function getConversationEntries(chatTab: ChatTab): ChatConversationEntry[] {
        const messages = rightSideStripeChat.getChatMessages(chatTab);
        const entries: ChatConversationEntry[] = [];

        messages.forEach((message, messageIndex) => {
            if (isPromptMessage(message)) {
                entries.push({
                    prompt: message,
                    outputs: [],
                    promptIndex: messageIndex,
                    key: `${chatTab.id}-${messageIndex}`
                });
                return;
            }

            if (isOutputMessage(message)) {
                const lastEntry = entries[entries.length - 1];
                if (!lastEntry) {
                    return;
                }

                lastEntry.outputs = [...lastEntry.outputs, message];
            }
        });

        return entries;
    }

    function updateActiveChatTab(updater: (chatTab: ChatTab) => ChatTab): boolean {
        const activeChatLocal = get(activeChat);
        if (!activeChatLocal) {
            return false;
        }

        return chatStripeTabsOfWorkspaceFile.updateChatTabById(activeChatLocal.id, updater);
    }

    function createEmptyContextPayload(): ContextSpecificationPayload {
        return {
            desktopFiles: [],
            editorFiles: [],
            networkUrls: []
        };
    }

    function cloneModelForTab(model: AI.RavenLensAvaiableAIModel | undefined): ChatTab["selectedModel"] {
        if (!model) {
            return undefined;
        }

        return {
            model: model.model,
            provider: model.provider
        };
    }

    function isSameTabModel(
        left: ChatTab["selectedModel"],
        right: ChatTab["selectedModel"]
    ): boolean {
        if (!left && !right) {
            return true;
        }

        if (!left || !right) {
            return false;
        }

        return left.model === right.model && left.provider === right.provider;
    }

    function toContextPayloadFromTab(chatTab: ChatTab): ContextSpecificationPayload {
        return {
            desktopFiles: Array.isArray(chatTab.selectedContext?.desktopFiles)
                ? [...chatTab.selectedContext.desktopFiles]
                : [],
            editorFiles: Array.isArray(chatTab.selectedContext?.editorFiles)
                ? [...chatTab.selectedContext.editorFiles]
                : [],
            networkUrls: Array.isArray(chatTab.selectedContext?.networkUrls)
                ? [...chatTab.selectedContext.networkUrls]
                : []
        };
    }

    function toTabContextPayload(chatTab: ChatTab, payload: ContextSpecificationPayload): ChatTab["selectedContext"] {
        return {
            desktopFiles: [...payload.desktopFiles],
            editorFiles: [...payload.editorFiles],
            networkUrls: [...payload.networkUrls],
            aiAnswers: Array.isArray(chatTab.selectedContext?.aiAnswers)
                ? [...chatTab.selectedContext.aiAnswers]
                : []
        };
    }

    function isContextPayloadEqual(left: ContextSpecificationPayload, right: ContextSpecificationPayload): boolean {
        return JSON.stringify(left) === JSON.stringify(right);
    }

    function cloneContextPayload(payload: ContextSpecificationPayload): ContextSpecificationPayload {
        return {
            desktopFiles: [...payload.desktopFiles],
            editorFiles: [...payload.editorFiles],
            networkUrls: [...payload.networkUrls]
        };
    }

    function normalizeSelectedMCPServerNames(serverNames: string[], availableMCPServers: string[]): string[] {
        const normalizedServerNames = serverNames
            .map(serverName => serverName.trim())
            .filter(serverName => serverName.length > 0)
            .filter(serverName => availableMCPServers.includes(serverName));

        return [...new Set(normalizedServerNames)];
    }

    function areStringArraysEqual(left: string[], right: string[]): boolean {
        return left.length === right.length && left.every((item, itemIndex) => item === right[itemIndex]);
    }

    // Helpers
    function escapeHtml(text: string): string {
        return text
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function htmlToText(value: string): string {
        return value
            .replaceAll(/<br\s*\/?\s*>/gi, "\n")
            .replaceAll(/<[^>]+>/g, "")
            .replaceAll("&nbsp;", " ")
            .replaceAll("&amp;", "&")
            .replaceAll("&lt;", "<")
            .replaceAll("&gt;", ">")
            .replaceAll("&quot;", '"')
            .replaceAll("&#039;", "'");
    }

    function getPromptHtml(inputText: string): string {
        return escapeHtml(inputText).replaceAll("\n", "<br />");
    }

    function getTextFieldModeName(mode: AIChatMode): string {
        return editorAIChat.getTextFieldModeTranslation(mode);
    }

    function getMCPServersList(servers: MCPServersSpec): string[] {
        try {
            return Object.keys(servers.mcpServers) ?? [];
        }
        catch(err) {
            console.error('Error when parsing mcp servers', err);
            return [];
        }
    }

    // Handlers
    function onClickSelectedTextToggle() {
        isSelectedTextPreviewOpen = !isSelectedTextPreviewOpen;
    }

    function onMouseEnterPreviewText(from: number, to: number) {
        mouseIsOnPreviewSelectedText = { from, to };
    }

    function onMouseLeavePreviewText() {
        mouseIsOnPreviewSelectedText = null;
    }

    function onRemoveSelectedText(from: number, to: number) {
        editorAIChat.removeSelectedText(from, to);
    }

    function onClickSelectMode(event: MouseEvent) {
        event.stopPropagation();
        isModeSelectingTrayOpen = !isModeSelectingTrayOpen;
        if (isModeSelectingTrayOpen) {
            isMermaidModeSelectionTrayOpen = false;
        }
    }

    function onSelectNewMode(mode: AIChatMode) {
        editorAIChat.setTextFieldMode(mode);
        isModeSelectingTrayOpen = false;
    }

    // FIXME: Remove
    function buildMockResponse(prompt: string, mode: AIChatMode, chatTab: ChatTab): MessageOutput[] {
        const escapedPrompt = escapeHtml(prompt || "context only prompt");
        const outputMessage: MessageOutput = {
            id: '111111',
            time: {
                startAt: new Date(),
            },
            messageType: "message-user-output",
            messageContentHTML: `<p><strong>Mode:</strong> ${escapeHtml(getTextFieldModeName(mode))}</p><p>Generated response for: ${escapedPrompt}</p>`,
            model: rightSideStripeChat.createModelForMessage(chatTab),
            reasoning: [],
            aiChatMode: "regular-ask",
            isAnswering: true
        };

        return [outputMessage];
    }

    // TODO: Integrate with backend
    function onSendMessage() {
        if (!isMessagingActive) {
            return;
        }

        const promptText = textContent.trim();
        const selectedRanges = $editorAIChat.selectedTextRanges ?? [];
        if (!promptText && !selectedRanges.length) {
            return;
        }

        // Show send user prompt
        const promptHTML = getPromptHtml(promptText);
        const mode = $editorAIChat.textFieldMode;
        const appended = rightSideStripeChat.appendPromptMessage({
            prompt: promptText,
            promptHTML,
            mode
        });

        // Clear both reactive state and the DOM element to avoid stale textarea value.
        textContent = "";
        if (composerTextareaElement) {
            composerTextareaElement.value = "";
        }
        composerResetKey += 1;

        if (!appended) {
            return;
        }

        const { chatId } = appended;
        void chatId;

        const activeChatSnapshot = $activeChat;
        if (!activeChatSnapshot) {
            return;
        }

        editorAIChat.clearSelectedText();
        displayContextForMessages.set([]);
        isSelectedTextPreviewOpen = true;

        // Simulate answer
        setTimeout(() => {
            rightSideStripeChat.appendOutputMessages(chatId, buildMockResponse(promptText, mode, activeChatSnapshot));
        }, 300);

        // Simulate end
        setTimeout(() => {
            // Remove chat processing stage
            rightSideStripeChat.stopProcessing(chatId);
        }, 5_000);
    }

    // TODO: Intergrate with backend
    function onStopMessage() {
        // Remove chat processing stage
        if (!$activeChat?.id) {
            return;
        }

        rightSideStripeChat.stopProcessing($activeChat.id);
    }

    function onToggleMCPServersSelectionModal() {
        isMCPServersSelectionOpen = !isMCPServersSelectionOpen;
    }

    async function onContextSelection() {
        const activeChatLocal = $activeChat;
        if (!activeChatLocal) {
            return;
        }

        selectedFileContextPayload = toContextPayloadFromTab(activeChatLocal);
        contextModalSelectedChatId = activeChatLocal.id;
        isContextSelectionModalOpen = true;
    }

    function onSaveSelectedFileContext(payload: ContextSpecificationPayload) {
        const chatIdForContext = contextModalSelectedChatId ?? $activeChat?.id;
        if (!chatIdForContext) {
            return;
        }

        const normalizedPayload = cloneContextPayload(payload);
        selectedFileContextPayload = cloneContextPayload(normalizedPayload);
        chatStripeTabsOfWorkspaceFile.updateChatTabById(chatIdForContext, (chatTab) => ({
            ...chatTab,
            selectedContext: toTabContextPayload(chatTab, normalizedPayload)
        }));

        contextModalSelectedChatId = null;

    }

    function onSelectTaskBarAnswer() {
        $isPointsStripeOpen = true;
        isContextSelectionModalOpen = false;
    }

    // Context answers
    function getContextAnswerTextRepresentation(htmlAnswer: string) {
        const domParsed = new DOMParser().parseFromString(htmlAnswer, "text/html");
        const domText = domParsed.body.textContent ?? "";

        const MAX_TEXT_LENGHT = 24;
        
        return `${domText.slice(0, MAX_TEXT_LENGHT)}${domText.length >= MAX_TEXT_LENGHT ? "..." : ""}`
    }

    function onClickAnswer(answerId: string) {
        return () => {
            SelectedAnswerFromChatContext.emit(answerId);
        }
    }
    
    function onDeleteContextAnswer(answerId: string) {
        return () => {
            const result = selectedChatAnswerIds.removeCurrentFileAnswerId(answerId);

            if (!result) {
                console.error(`Cannot remove answer from context`, answerId)
            }
        }
    }

    // Effects
    $effect(() => {
        rightSideStripeChat.setLoading($isLoadedChatsOfWorkspaceFileLoading);
    });

    $effect(() => {
        const activeChatLocal = $activeChat;

        if (isContextSelectionModalOpen && contextModalSelectedChatId && activeChatLocal?.id !== contextModalSelectedChatId) {
            isContextSelectionModalOpen = false;
            contextModalSelectedChatId = null;
        }

        if (!activeChatLocal) {
            selectedFileContextPayload = createEmptyContextPayload();
            selectedMCPServerNames.set([]);
            editorAIChat.setTextFieldMode("regular-ask");
            return;
        }

        if ($editorAIChat.textFieldMode !== activeChatLocal.selectedMode) {
            editorAIChat.setTextFieldMode(activeChatLocal.selectedMode);
        }

        const contextPayloadFromActiveChat = toContextPayloadFromTab(activeChatLocal);
        if (!isContextPayloadEqual(selectedFileContextPayload, contextPayloadFromActiveChat)) {
            selectedFileContextPayload = contextPayloadFromActiveChat;
        }

        const activeMCPServerNames = normalizeSelectedMCPServerNames(
            activeChatLocal.selectedMCPServers,
            getMCPServersList(downloadMCPServersSpecification)
        );
        if (!areStringArraysEqual($selectedMCPServerNames, activeMCPServerNames)) {
            selectedMCPServerNames.set(activeMCPServerNames);
        }

        if (activeChatLocal.selectedModel) {
            const modelFromSelection = avaiableModels.find((model) => {
                return model.model === activeChatLocal.selectedModel?.model
                    && model.provider === activeChatLocal.selectedModel?.provider;
            }) ?? avaiableModels.find((model) => model.model === activeChatLocal.selectedModel?.model);

            if (modelFromSelection) {
                if (!isSameTabModel(cloneModelForTab($selectedModel), cloneModelForTab(modelFromSelection))) {
                    selectedModel.set(modelFromSelection);
                }

                if ($selectedModelKey !== modelFromSelection.model) {
                    selectedModelKey.set(modelFromSelection.model);
                }
            }
        }
    });

    $effect(() => {
        const activeChatLocal = $activeChat;
        const selectedModelLocal = $selectedModel;
        if (!activeChatLocal || !selectedModelLocal) {
            return;
        }

        const modelForTab = cloneModelForTab(selectedModelLocal);
        if (isSameTabModel(activeChatLocal.selectedModel, modelForTab)) {
            return;
        }

        updateActiveChatTab((chatTab) => ({
            ...chatTab,
            selectedModel: modelForTab
        }));
    });

    $effect(() => {
        const activeChatLocal = $activeChat;
        const selectedModelKeyLocal = $selectedModelKey;
        if (!activeChatLocal || !selectedModelKeyLocal) {
            return;
        }

        const modelFromKey = avaiableModels.find((model) => model.model === selectedModelKeyLocal);
        if (!modelFromKey) {
            return;
        }

        const modelForTab = cloneModelForTab(modelFromKey);
        if (isSameTabModel(activeChatLocal.selectedModel, modelForTab)) {
            return;
        }

        updateActiveChatTab((chatTab) => ({
            ...chatTab,
            selectedModel: modelForTab
        }));
    });

    $effect(() => {
        const selectedServerNames = $selectedMCPServerNames;
        const activeChatLocal = $activeChat;
        const availableMCPServers = getMCPServersList(downloadMCPServersSpecification);
        if (!activeChatLocal) {
            return;
        }

        const normalizedServerNames = normalizeSelectedMCPServerNames(selectedServerNames, availableMCPServers);
        if (areStringArraysEqual(activeChatLocal.selectedMCPServers, normalizedServerNames)) {
            return;
        }

        updateActiveChatTab((chatTab) => ({
            ...chatTab,
            selectedMCPServers: normalizedServerNames
        }));
    });
    
    $effect(() => {
        const selectedRangesCount = $editorAIChat.selectedTextRanges?.length ?? 0;
        const isSelectedTextOpen = isSelectedTextPreviewOpen;
        void selectedRangesCount;
        void isSelectedTextOpen;

        updateHistoryBottomPadding();
    });

    // Lifecycle hooks
    onMount(() => {
        let resizeObserver: ResizeObserver | undefined;

        void (async () => {
            await tick();
            updateHistoryBottomPadding();

            if (bottomInteractions) {
                resizeObserver = new ResizeObserver(() => {
                    updateHistoryBottomPadding();
                });

                resizeObserver.observe(bottomInteractions);
            }

            const mcpDownloadResponse = await fetchAuthenticated(
                "/mcp-config/servers-spec",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        workspaceId: $selectedWorkspace?.id
                    })
                }
            );

            if (mcpDownloadResponse.ok) {
                const serversSpec = await mcpDownloadResponse.json();
                downloadMCPServersSpecification = serversSpec;
            }
            else console.error(`Cannot download MCP Servers specification with server response status: ${mcpDownloadResponse.status}`)

            // downloadMCPServersSpecification = {
            //     mcpServers: {
            //         serverA: {},
            //         serverB: {},
            //         serverC: {}
            //     }
            // }
        })();

        return () => {
            resizeObserver?.disconnect();
        };
    })
</script>

<div 
    id="ai-chat-history"
    class="flex-1 min-h-0 overflow-y-auto pr-1"
    bind:this={chatHistoryElement}
>
    {#if $rightSideStripeChat.isLoading}
        <div class="flex h-full w-full items-center justify-center text-base-content/60 gap-2">
            <span class="loading loading-spinner loading-sm"></span>
            <span>Loading chat history...</span>
        </div>
    {:else if chatConversations.length}
        <div class="flex flex-col gap-16 pb-1 p-4 pb-10">
            {#each $activeChat.messages as message (message)}
                {#if message.messageType === "message-user-prompt"}
                    <UserPrompt 
                        {message}
                    />
                {:else}
                    <AIResponse
                        {message}
                    />
                {/if}
            {/each}
        </div>
    {:else}
        <div
            class="w-full h-full flex items-center justify-center"
        >
            <div class="h-fit w-fit flex flex-col justify-center text-center items-center">
                <Icon icon="mdi:chat-outline" width="28" height="28" />
                <h3 class="font-semibold">Start a conversation</h3>
                <p class="text-black/50 theme-dark:text-white/50">Ask a question, request a summary, or generate a diagram.</p>
            </div>
        </div>
    {/if}
</div>

<div 
    id="bottom-interactions"
    class="absolute inset-x-0 bottom-0 p-3 z-10 bg-base-100"
    bind:this={bottomInteractions}
>
    {#if $editorAIChat.selectedTextRanges?.length}
        <div class="rounded-lg border border-base-300 bg-base-200 p-2">
            <button class="btn btn-ghost btn-xs px-1" onclick={onClickSelectedTextToggle}>
                {#if isSelectedTextPreviewOpen}
                    <Icon icon="mdi:chevron-up" width="14" height="14" />
                {:else}
                    <Icon icon="mdi:chevron-down" width="14" height="14" />
                {/if}
                <span>{isSelectedTextPreviewOpen ? "Hide" : "Show"} selected text</span>
            </button>

            {#if isSelectedTextPreviewOpen}
                <div class="mt-2 max-h-40 overflow-y-auto space-y-1">
                    {#each $editorAIChat.selectedTextRanges as selectedText, i (selectedText.id)}
                        {@const isTextSelected = mouseIsOnPreviewSelectedText
                            && mouseIsOnPreviewSelectedText.from === selectedText.from
                            && mouseIsOnPreviewSelectedText.to === selectedText.to}
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div
                            class="rounded-md p-1 text-sm {isTextSelected ? 'bg-primary/20 text-primary-content' : 'bg-base-100'}"
                            onmouseenter={() => onMouseEnterPreviewText(selectedText.from, selectedText.to)}
                            onmouseleave={onMouseLeavePreviewText}
                        >
                            <div class="flex items-start gap-2">
                                <button class="btn btn-ghost btn-xs btn-square" onclick={() => onRemoveSelectedText(selectedText.from, selectedText.to)}>
                                    <Icon icon="mdi:close" width="12" height="12" />
                                </button>
                                <span class="break-all whitespace-pre-wrap">{selectedText.text}</span>
                            </div>
                        </div>
                        {#if i !== $editorAIChat.selectedTextRanges.length - 1}
                            <div class="border-b border-base-300"></div>
                        {/if}
                    {/each}
                </div>
            {/if}
        </div>
    {/if}

    <div class="rounded-lg border border-base-300 bg-sky-200/20 theme-dark:bg-base-300 p-2 px-0.5">
        <div class="mb-2 flex items-center gap-2 relative">
            <!-- Modes selection tray -->
            {#if isModeSelectingTrayOpen}
                {@const allModes = Object.entries($CHAT_MODES) as [AIChatMode, ChatModeValue][]}
                <div id="chat-mode-selection-tray" class="absolute bottom-[calc(100%+6px)] left-0 z-50 rounded-lg border border-base-300 bg-base-100 shadow-xl p-2 min-w-44">
                    <div class="text-xs text-base-content/60 mb-1">Select mode</div>
                    <div class="flex flex-col gap-1">
                        {#each allModes as [mode, modeValue] (mode)}
                            {@const isDisabled = !modeValue.isEnabled}
                            <div
                                class="tooltip tooltip-right"
                                data-tip={isDisabled ? `You've to be active collaborator of file to have access to this mode. You'll regain this mode once you become collaborator` : modeValue.modeDescription}
                            >
                                <button
                                    class="btn btn-ghost btn-xs justify-start {mode === $editorAIChat.textFieldMode ? 'btn-active' : ''}"
                                    disabled={isDisabled}
                                    onclick={() => onSelectNewMode(mode)}
                                >
                                    {modeValue.modeName}
                                </button>
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}

            <!-- Mode ignite btn -->
            <button class="btn btn-ghost btn-xs" disabled={!isMessagingActive} onclick={onClickSelectMode}>
                <Icon icon="mdi:at" width="14" height="14" />
                <span>{getTextFieldModeName($editorAIChat.textFieldMode)}</span>
            </button>

            <!-- Context selection btn -->
            <button
                class="btn btn-ghost btn-xs"
                title="Context specification" 
                disabled={!isMessagingActive}
                onclick={onContextSelection}
            >
                <Icon icon="material-symbols:note-stack-outline-rounded" width="14" height="14"/>
            </button>

            <!-- MCP Servers Selection -->
             <!-- FIXME: This is commented in MVP -->
            <!-- <div
                class="tooltip tooltip-top"
                data-tip={!isMCPSpecificationAvailableForWorkspace ? "Workspace hasn't got specified MCP Servers. Specify MCP Servers for workspace first" : ""}
            >
                <button
                    class="btn btn-ghost btn-xs"
                    title="MCP Servers Selection for Action"
                    onclick={onToggleMCPServersSelectionModal}
                >
                    <Icon icon="carbon:logo-model-context-protocol"/>
                </button>
            </div> -->

            <!-- Model spec -->
            <div class="w-fit">
                <ModelsListSelection/>
            </div>
        </div>

        <div class="relative">
            {#key composerResetKey}
                {@const isDisabled = !isMessagingActive || isActiveChatProcessing ? true : false}
                <textarea
                    id="writable-for-chat"
                    class="w-full min-h-24 max-h-52 outline-none overflow-y-auto rounded-md border border-base-300 bg-base-100 p-2 text-sm"
                    class:opacity-50={isDisabled}
                    class:cursor-not-allowed={isDisabled}
                    disabled={isDisabled}
                    placeholder={$editorAIChat.selectedTextRanges?.length ? "Type order to context..." : "Type subject..."}
                    bind:value={textContent}
                    bind:this={composerTextareaElement}
                ></textarea>
            {/key}

            {#if isActiveChatProcessing}
                <button
                    class="btn btn-neutral btn-sm btn-square rounded-full absolute bottom-2 right-2"
                    title="Stop Chat Processing"
                    onclick={onStopMessage}
                >
                    <Icon icon="material-symbols:stop-rounded" width="14" height="14" />
                </button>
            {:else}
                <button
                    class="btn btn-primary btn-sm btn-square rounded-full absolute bottom-2 right-2"
                    disabled={!textContent.trim() && !$editorAIChat.selectedTextRanges?.length}
                    title="Send Message"
                    onclick={onSendMessage}
                >
                    <Icon icon="material-symbols:send-rounded" width="14" height="14" />
                </button>
            {/if}
        </div>
    </div>
</div>

<!-- MCP Servers selection modal -->
<!-- FIXME: In MVP this is disabled -->
 <!-- TODO: Make 2 categories:
    --- All
    [] Select All servers

    --- Granual
    [] Server a [] Server b

* Use "Granual" to unselect selected [] Selected All servers if were selected before
 -->
<!-- <McpServerSelectionModal
    bind:open={isMCPServersSelectionOpen}
    bind:selectedMCPServerNames={$selectedMCPServerNames}
    avaiableMCPServers={getMCPServersList(downloadMCPServersSpecification)}
    close={onToggleMCPServersSelectionModal}
/> -->

<ContextSelectionModal
    bind:open={isContextSelectionModalOpen}
    contextPayload={selectedFileContextPayload}
    onSave={onSaveSelectedFileContext}
    infoMessage="Context is saved for the currently active chat tab."
>
    <div class="space-y-2">
        <div class="flex items-center justify-between">
            <p class="text-xs uppercase tracking-wide opacity-70">Taskbar Answers</p>

            <div>
                <button
                    class="btn btn-xs btn-ghost"
                    onclick={onSelectTaskBarAnswer}
                >
                    <Icon icon="material-symbols:business-messages-outline-rounded"/>
                    <span>
                        Select Taskbar Answer
                    </span>
                </button>
            </div>
        </div>

        <!-- List with answers -->
        <div
            class="flex flex-col gap-5"
        >
            {#if $selectedChatAnswerIds.length}
                {#each $selectedChatAnswerIds as answerId (answerId)}
                    {@const fetchedAnswer = selectedChatAnswerIds.retriveCurrentFileAnswer(answerId, true)}

                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    {#if fetchedAnswer}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <div 
                            class="flex justify-between p-1 border border-base-300 rounded-lg items-center"
                            data-answer-id={answerId}
                            onclick={onClickAnswer(answerId)}
                        >
                            <div
                                class="flex flex-col gap-0.5"
                            >
                                <p class="text-xs text-gray-500 theme-dark:text-gray-400">{new Date(fetchedAnswer?.endDateTimestamp ?? Date.now()).toLocaleDateString("en-EN")}</p>
                                <p class="text-medium">{getContextAnswerTextRepresentation(fetchedAnswer?.answerTipTapHTML ?? "")}</p>
                            </div>

                            <button
                                class="btn btn-sm btn-ghost"
                                onclick={onDeleteContextAnswer(answerId)}
                            >
                                <Icon icon="material-symbols:close-rounded" class="text-[13px]"/>
                            </button>
                        </div>
                    {/if}
                {/each}
            {:else}
                <p class="text-xs opacity-60">No ai-task-answer selected.</p>
            {/if}
        </div>
    </div>
</ContextSelectionModal>

<style>
    #ai-chat-history {
        max-height: 100%;
        scrollbar-gutter: stable;
    }

    #bottom-interactions {
        max-height: var(--chat-bottom-interactions-max-h, min(48%, 22rem));
        overflow: visible;
    }

    #writable-for-chat:empty::before {
        content: attr(data-placeholder);
        color: color-mix(in oklab, var(--fallback-bc, oklch(var(--bc) / 1)) 55%, transparent);
        pointer-events: none;
    }
</style>
