<script lang="ts">
    import ModelsListSelection from "$lib/ai/ModelsListSelection.svelte";
    import { selectedModelKey } from "$lib/ai/model";
    import { avaiableModels } from "$lib/config/models";
    import McpServerSelectionModal from "$lib/mcp/components/McpServerSelectionModal.svelte";
    import ContextSelectionModal from "$lib/modals/ContextSelectionModal.svelte";
    import {
        SelectedAnswerFromChatContext,
        chatStripeTabsOfWorkspaceFile,
        isLoadedChatsOfWorkspaceFileLoading,
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
        MessageUserPrompt
    } from "@ravenlens/shared/chat-ai/backend/schema";
    import { CHAT_MODES, chatLayoutStore as rightSideStripeChatLayout, type ChatModeValue } from "./config";
    import { derived, get, writable } from "svelte/store";
    import { onMount } from "svelte";
    import UserPrompt from "./bubbles/UserPrompt.svelte";
    import AIResponse from "./bubbles/AIResponse.svelte";

    let {
        isModeSelectingTrayOpen = $bindable(false),
        isMermaidModeSelectionTrayOpen = $bindable(false)
    }: {
        isModeSelectingTrayOpen: boolean;
        isMermaidModeSelectionTrayOpen: boolean;
    } = $props();

    // State
    let textContent = $state("");
    let showFullPromptTextIds = $state<string[]>([]);
    let isSelectedTextPreviewOpen = $state(true);
    let mouseIsOnPreviewSelectedText = $state<{ from: number; to: number } | null>(null);
    let composerResetKey = $state(0);
    let chatHistoryElement = $state<HTMLDivElement | null>(null);

    type ContextSpecificationPayload = File.FileAI.ContextSpecificationPayload;
    type AppendedPromptMessageResult = {
        chatId: string;
        promptIndex: number;
    };
    type ChatMessage = ChatTab["messages"][number];
    type ChatPromptMessage = Extract<ChatMessage, { messageType: "message-user-prompt" }>;
    type ChatOutputMessage = Extract<ChatMessage, { messageType: "message-user-output" }>;
    type SelectedTextRange = {
        id: string;
        from: number;
        to: number;
        html: string;
    };
    type EditorAIChatState = {
        textFieldMode: AIChatMode;
        selectedText?: {
            ranges: SelectedTextRange[];
        };
    };
    type ChatConversationEntry = {
        prompt: ChatPromptMessage;
        outputs: ChatOutputMessage[];
        promptIndex: number;
        key: string;
    };

    interface MCPServersSpec {
        mcpServers: Record<string, unknown>;
    }

    const activeChat = derived(chatStripeTabsOfWorkspaceFile, (chatTabs) => {
        return chatTabs.find(chatTab => chatTab.isActive) ?? chatTabs[0];
    });

    const displayContextForMessages = writable<string[]>([]);
    const selectedMCPServerNames = writable<string[]>([]);

    function getChatMessages(chatTab: ChatTab): ChatTab["messages"] {
        if (!Array.isArray(chatTab.messages)) {
            return [];
        }

        return [...chatTab.messages];
    }

    function isPromptMessage(message: ChatMessage): message is ChatPromptMessage {
        return message.messageType === "message-user-prompt";
    }

    function isOutputMessage(message: ChatMessage): message is ChatOutputMessage {
        return message.messageType === "message-user-output";
    }

    function getConversationEntries(chatTab: ChatTab): ChatConversationEntry[] {
        const messages = getChatMessages(chatTab);
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

    function createModelForMessage(chatTab: ChatTab): AIChatModel {
        const selectedModelForTab = chatTab.selectedModel;
        const selectedModelFromStore = $selectedModel;

        if (selectedModelForTab) {
            return {
                model: selectedModelForTab.model,
                provider: selectedModelForTab.provider,
                weight: 1
            };
        }

        if (selectedModelFromStore) {
            return {
                model: selectedModelFromStore.model,
                provider: selectedModelFromStore.provider,
                weight: 1
            };
        }

        return {
            model: "gpt-4o",
            provider: "OpenAI",
            weight: 1
        };
    }

    function clonePromptContext(context: ChatTab["selectedContext"]): MessageUserPrompt["context"] {
        const normalizedContext = {
            desktopFiles: [...context.desktopFiles],
            editorFiles: [...context.editorFiles],
            networkUrls: [...context.networkUrls],
            aiAnswers: [...context.aiAnswers]
        };

        return [normalizedContext] as MessageUserPrompt["context"];
    }

    function getPromptContextForDisplay(prompt: ChatPromptMessage): ChatTab["selectedContext"] | null {
        const context = prompt.context;
        if (!context) {
            return null;
        }

        if (Array.isArray(context)) {
            const firstContext = context[0];
            if (!firstContext) {
                return null;
            }

            return {
                desktopFiles: Array.isArray(firstContext.desktopFiles) ? [...firstContext.desktopFiles] : [],
                editorFiles: Array.isArray(firstContext.editorFiles) ? [...firstContext.editorFiles] : [],
                networkUrls: Array.isArray(firstContext.networkUrls) ? [...firstContext.networkUrls] : [],
                aiAnswers: Array.isArray(firstContext.aiAnswers) ? [...firstContext.aiAnswers] : []
            };
        }

        return {
            desktopFiles: Array.isArray((context as ChatTab["selectedContext"]).desktopFiles)
                ? [...(context as ChatTab["selectedContext"]).desktopFiles]
                : [],
            editorFiles: Array.isArray((context as ChatTab["selectedContext"]).editorFiles)
                ? [...(context as ChatTab["selectedContext"]).editorFiles]
                : [],
            networkUrls: Array.isArray((context as ChatTab["selectedContext"]).networkUrls)
                ? [...(context as ChatTab["selectedContext"]).networkUrls]
                : [],
            aiAnswers: Array.isArray((context as ChatTab["selectedContext"]).aiAnswers)
                ? [...(context as ChatTab["selectedContext"]).aiAnswers]
                : []
        };
    }

    function updateChatTabById(chatId: string, updater: (chatTab: ChatTab) => ChatTab): boolean {
        let wasUpdated = false;

        chatStripeTabsOfWorkspaceFile.update((chatTabs) => {
            return chatTabs.map((chatTab) => {
                if (chatTab.id !== chatId) {
                    return chatTab;
                }

                wasUpdated = true;
                return updater(chatTab);
            });
        });

        return wasUpdated;
    }

    function updateActiveChatTab(updater: (chatTab: ChatTab) => ChatTab): boolean {
        const activeChatLocal = get(activeChat);
        if (!activeChatLocal) {
            return false;
        }

        return updateChatTabById(activeChatLocal.id, updater);
    }

    const rightSideStripeChat = (() => {
        const { ...all } = writable({
            isLoading: false
        });

        return {
            ...all,
            setLoading(isLoading: boolean) {
                all.set({ isLoading });
            },
            appendPromptMessage(params: {
                prompt: string;
                promptHTML: string;
                mode: AIChatMode;
            }): AppendedPromptMessageResult | undefined {
                const activeChatLocal = get(activeChat);
                if (!activeChatLocal) {
                    return undefined;
                }

                const promptMessage: MessageUserPrompt = {
                    messageType: "message-user-prompt",
                    messageContentHTML: params.promptHTML,
                    model: createModelForMessage(activeChatLocal),
                    aiChatMode: params.mode,
                    context: clonePromptContext(activeChatLocal.selectedContext),
                    mcpSelectedServerNames: [...activeChatLocal.selectedMCPServers]
                };

                const promptIndex = getChatMessages(activeChatLocal).length;

                const wasUpdated = updateChatTabById(activeChatLocal.id, (chatTab) => {
                    return {
                        ...chatTab,
                        messages: [...getChatMessages(chatTab), promptMessage]
                    };
                });

                if (!wasUpdated) {
                    return undefined;
                }

                return {
                    chatId: activeChatLocal.id,
                    promptIndex
                };
            },
            appendOutputMessages(chatId: string, messagesToAppend: MessageOutput[]) {
                updateChatTabById(chatId, (chatTab) => {
                    return {
                        ...chatTab,
                        messages: [...getChatMessages(chatTab), ...messagesToAppend]
                    };
                });
            }
        };
    })();

    const editorAIChat = (() => {
        const { ...all } = writable<EditorAIChatState>({
            textFieldMode: "regular-ask",
            selectedText: {
                ranges: []
            }
        });

        return {
            ...all,
            setTextFieldMode(mode: AIChatMode, syncWithActiveTab: boolean = true) {
                all.update((state) => ({
                    ...state,
                    textFieldMode: mode
                }));

                if (!syncWithActiveTab) {
                    return;
                }

                updateActiveChatTab((chatTab) => ({
                    ...chatTab,
                    selectedMode: mode
                }));
            },
            removeSelectedText(from: number, to: number) {
                all.update((state) => ({
                    ...state,
                    selectedText: {
                        ranges: (state.selectedText?.ranges ?? []).filter((range) => {
                            return range.from !== from || range.to !== to;
                        })
                    }
                }));
            },
            clearSelectedText() {
                all.update((state) => ({
                    ...state,
                    selectedText: {
                        ranges: []
                    }
                }));
            },
            getTextFieldModeTranslation(mode: AIChatMode): string {
                return get(CHAT_MODES)[mode]?.modeName ?? mode;
            }
        };
    })();

    let downloadMCPServersSpecification = $state<MCPServersSpec>({ mcpServers: {} });
    
    let isMCPServersSelectionOpen = $state(false);
    let isContextSelectionModalOpen = $state(false);
    let isMCPSpecificationAvailableForWorkspace = $derived(getMCPServersList(downloadMCPServersSpecification).length > 0)
    let selectedFileContextPayload = $state<ContextSpecificationPayload>(createEmptyContextPayload());
    let contextModalSelectedChatId = $state<string | null>(null);

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
            editorAIChat.setTextFieldMode("regular-ask", false);
            return;
        }

        if ($editorAIChat.textFieldMode !== activeChatLocal.selectedMode) {
            editorAIChat.setTextFieldMode(activeChatLocal.selectedMode, false);
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

    let chatConversations = $derived($activeChat ? getConversationEntries($activeChat) : []);
    let isMessagingActive = $derived(Boolean($selectedFile && !$rightSideStripeChat.isLoading && $rightSideStripeChatLayout.isOpen));
    
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
    function onShowOrHidePrompt(chatBubbleId: string) {
        const isExpanded = showFullPromptTextIds.includes(chatBubbleId);
        showFullPromptTextIds = isExpanded
            ? showFullPromptTextIds.filter((id) => id !== chatBubbleId)
            : [...showFullPromptTextIds, chatBubbleId];
    }

    function onShowHideMessageContext(chatBubbleId: string) {
        displayContextForMessages.update((visibleContexts) => {
            return visibleContexts.includes(chatBubbleId)
                ? visibleContexts.filter((id) => id !== chatBubbleId)
                : [...visibleContexts, chatBubbleId];
        });
    }

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

    function getMessageMode(prompt: ChatPromptMessage): AIChatMode {
        return prompt.aiChatMode;
    }

    function onMessageInput(event: Event) {
        const target = event.currentTarget as HTMLDivElement;
        textContent = target.innerText;
    }

    function buildMockResponse(prompt: string, mode: AIChatMode, chatTab: ChatTab): MessageOutput[] {
        const escapedPrompt = escapeHtml(prompt || "context only prompt");
        const outputMessage: MessageOutput = {
            messageType: "message-user-output",
            messageContentHTML: `<p><strong>Mode:</strong> ${escapeHtml(getTextFieldModeName(mode))}</p><p>Generated response for: ${escapedPrompt}</p>`,
            model: createModelForMessage(chatTab),
            reasoning: []
        };

        return [outputMessage];
    }

    function onSendMessage() {
        if (!isMessagingActive) {
            return;
        }

        const promptText = textContent.trim();
        const selectedRanges = $editorAIChat.selectedText?.ranges ?? [];
        if (!promptText && !selectedRanges.length) {
            return;
        }

        const promptHTML = getPromptHtml(promptText);
        const mode = $editorAIChat.textFieldMode;

        const appended = rightSideStripeChat.appendPromptMessage({
            prompt: promptText,
            promptHTML,
            mode
        });

        if (!appended) {
            return;
        }

        const { chatId } = appended;
        const activeChatSnapshot = $activeChat;
        if (!activeChatSnapshot) {
            return;
        }

        textContent = "";
        composerResetKey += 1;

        editorAIChat.clearSelectedText();
        displayContextForMessages.set([]);
        isSelectedTextPreviewOpen = true;

        setTimeout(() => {
            rightSideStripeChat.appendOutputMessages(chatId, buildMockResponse(promptText, mode, activeChatSnapshot));
        }, 900);
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
        updateChatTabById(chatIdForContext, (chatTab) => ({
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

    $effect(() => {
        const selectedRangesCount = $editorAIChat.selectedText?.ranges.length ?? 0;
        const isSelectedTextOpen = isSelectedTextPreviewOpen;
        void selectedRangesCount;
        void isSelectedTextOpen;

        if (!chatHistoryElement) {
            return;
        }

        const btmInteractionsElement = chatHistoryElement.parentElement?.querySelector("#bottom-interactions");
        if (btmInteractionsElement) {
            chatHistoryElement.style.paddingBottom = `${btmInteractionsElement.clientHeight}px`;
        }
    });

    // Lifecycle hooks
    onMount(async () => {
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
    })
</script>

{#snippet displayDate(dateInput: Date | string)}
    {@const date = new Date(dateInput)}
    {@const today = new Date()}
    {@const isToday = date.getDate() === today.getDate()
        && date.getMonth() === today.getMonth()
        && date.getFullYear() === today.getFullYear()}
    {@const day = date.getDate().toString().padStart(2, "0")}
    {@const month = (date.getMonth() + 1).toString().padStart(2, "0")}
    {@const year = date.getFullYear()}
    {@const hours = date.getHours().toString().padStart(2, "0")}
    {@const minutes = date.getMinutes().toString().padStart(2, "0")}
    {#if isToday}
        {hours}:{minutes}
    {:else}
        {day}.{month}.{year} {hours}:{minutes}
    {/if}
{/snippet}

<div 
    id="ai-chat-history"
    class="h-full flex-1 min-h-0 overflow-y-auto pr-1"
    bind:this={chatHistoryElement}
>
    {#if $rightSideStripeChat.isLoading}
        <div class="h-full flex items-center justify-center text-base-content/60 gap-2">
            <span class="loading loading-spinner loading-sm"></span>
            <span>Loading chat history...</span>
        </div>
    {:else if chatConversations.length}
        <div class="flex flex-col gap-5 pb-1 p-4">
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

<div id="bottom-interactions" class="absolute bottom-0 right-0 w-full p-3">
    {#if $editorAIChat.selectedText?.ranges.length}
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
                    {#each $editorAIChat.selectedText.ranges as selectedText, i (selectedText.id)}
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
                                <span class="break-all whitespace-pre-wrap">{htmlToText(selectedText.html)}</span>
                            </div>
                        </div>
                        {#if i !== $editorAIChat.selectedText.ranges.length - 1}
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
                <div class="absolute bottom-[calc(100%+6px)] left-0 z-20 rounded-lg border border-base-300 bg-base-100 shadow-xl p-2 min-w-44">
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
            <div
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
            </div>

            <!-- Model spec -->
            <div class="w-fit">
                <ModelsListSelection/>
            </div>
        </div>

        <div class="relative">
            {#key composerResetKey}
                <div
                    id="writable-for-chat"
                    class="min-h-24 max-h-52 outline-none overflow-y-auto rounded-md border border-base-300 bg-base-100 p-2 text-sm"
                    contenteditable={isMessagingActive}
                    data-placeholder={$editorAIChat.selectedText?.ranges.length ? "Type order to context..." : "Type subject..."}
                    oninput={onMessageInput}
                ></div>
            {/key}

            <button
                class="btn btn-primary btn-sm btn-square rounded-full absolute bottom-2 right-2"
                disabled={!textContent.trim() && !$editorAIChat.selectedText?.ranges.length}
                onclick={onSendMessage}
            >
                <Icon icon="material-symbols:send-rounded" width="14" height="14" />
            </button>
        </div>
    </div>
</div>

<!-- MCP Servers selection modal -->
<McpServerSelectionModal
    bind:open={isMCPServersSelectionOpen}
    bind:selectedMCPServerNames={$selectedMCPServerNames}
    avaiableMCPServers={getMCPServersList(downloadMCPServersSpecification)}
    close={onToggleMCPServersSelectionModal}
/>

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
    #writable-for-chat:empty::before {
        content: attr(data-placeholder);
        color: color-mix(in oklab, var(--fallback-bc, oklch(var(--bc) / 1)) 55%, transparent);
        pointer-events: none;
    }
</style>
