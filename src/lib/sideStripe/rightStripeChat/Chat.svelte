<script lang="ts">
    import ModelsListSelection from "$lib/ai/ModelsListSelection.svelte";
    import McpServerSelectionModal from "$lib/mcp/components/McpServerSelectionModal.svelte";
    import ContextSelectionModal from "$lib/modals/ContextSelectionModal.svelte";
    import { selectedFile } from "$lib/stores/files";
    import {
        activeChat,
        displayContextForMessages,
        editorAIChat,
        rightSideStripeChat,
        rightSideStripeChatLayout,
        SelectedAnswerFromChatContext,
        selectedChatAnswerIds,
        type AIChatBubble,
        type AIChatDecision,
        type AIChatMode,
        type AIChatResponse,
        type MermaidDiagramType
    } from "$lib/stores/rightSideStripeChat";
    import { isFileListSideStripeSelected, isPointsStripeOpen } from "$lib/stores/selectedSideStripes";
    import { selectedWorkspace } from "$lib/stores/workspace";
    import { fetchAuthenticated } from "$lib/utils/fetch";
    import Icon from "@iconify/svelte";
    import { File } from "@ravenlens/shared";
    import { get as getIndexedDBValue, set as setIndexedDBValue } from "idb-keyval";
    import { onMount } from "svelte";

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

    interface MCPServersSpec {
        mcpServers: Record<string, any>;
    }
    let downloadMCPServersSpecification = $state<MCPServersSpec>({ mcpServers: {} });
    
    let isMCPServersSelectionOpen = $state(false);
    let isContextSelectionModalOpen = $state(false);
    let isMCPSpecificationAvailableForWorkspace = $derived(getMCPServersList(downloadMCPServersSpecification).length > 0)
    let selectedFileContextPayload = $state<ContextSpecificationPayload>(createEmptyContextPayload());
    let contextModalSelectedFileId = $state<string | null>(null);
    const selectedFileContextCache: Record<string, ContextSpecificationPayload> = {};

    function getStorageKeyName(fileId: string) {
        const storageKeyName = `mcpServers:${fileId}`;
        return storageKeyName;
    }

    function getContextStorageKeyName(fileId: string) {
        const storageKeyName = `chatContext:${fileId}`;
        return storageKeyName;
    }

    function createEmptyContextPayload(): ContextSpecificationPayload {
        return {
            desktopFiles: [],
            editorFiles: [],
            networkUrls: []
        };
    }

    function cloneContextPayload(payload: ContextSpecificationPayload): ContextSpecificationPayload {
        return {
            desktopFiles: [...payload.desktopFiles],
            editorFiles: [...payload.editorFiles],
            networkUrls: [...payload.networkUrls]
        };
    }

    function isContextSpecificationPayload(value: unknown): value is ContextSpecificationPayload {
        return Boolean(
            value
            && typeof value === "object"
            && Array.isArray((value as ContextSpecificationPayload).desktopFiles)
            && Array.isArray((value as ContextSpecificationPayload).editorFiles)
            && Array.isArray((value as ContextSpecificationPayload).networkUrls)
        );
    }

    function getCachedContextPayload(fileId: string): ContextSpecificationPayload | null {
        const cachedContextPayload = selectedFileContextCache[fileId];
        if (!cachedContextPayload) {
            return null;
        }

        return cloneContextPayload(cachedContextPayload);
    }

    function setCachedContextPayload(fileId: string, contextPayload: ContextSpecificationPayload) {
        selectedFileContextCache[fileId] = cloneContextPayload(contextPayload);
    }

    type StoreSubscriber<T> = (value: T) => void;

    function createWritableStore<T>(initialValue: T) {
        let currentValue = initialValue;
        let subscribers: StoreSubscriber<T>[] = [];

        return {
            subscribe(subscriber: StoreSubscriber<T>) {
                subscriber(currentValue);
                subscribers = [...subscribers, subscriber];

                return () => {
                    subscribers = subscribers.filter((existingSubscriber) => existingSubscriber !== subscriber);
                };
            },
            set(nextValue: T) {
                currentValue = nextValue;
                subscribers.forEach((subscriber) => subscriber(nextValue));
            },
            update(updater: (value: T) => T) {
                const nextValue = updater(currentValue);
                currentValue = nextValue;
                subscribers.forEach((subscriber) => subscriber(nextValue));
            },
            getValue() {
                return currentValue;
            }
        }
    }

    function normalizeSelectedMCPServerNames(serverNames: string[], availableMCPServers: string[]): string[] {
        return serverNames.filter((serverName, index) => {
            return availableMCPServers.includes(serverName) && serverNames.indexOf(serverName) === index;
        });
    }

    function areStringArraysEqual(left: string[], right: string[]): boolean {
        return left.length === right.length && left.every((item, itemIndex) => item === right[itemIndex]);
    }

    async function readSelectedMCPServerNamesFromIndexedDB(fileId: string): Promise<string[]> {
        if (typeof window === "undefined") {
            return [];
        }

        try {
            const selectedServerNames = await getIndexedDBValue(getStorageKeyName(fileId));
            if (!Array.isArray(selectedServerNames)) {
                return [];
            }

            return selectedServerNames.filter((selectedServer): selectedServer is string => typeof selectedServer === "string");
        }
        catch (err) {
            console.error("Error when reading selected MCP servers from IndexedDB", err);
            return [];
        }
    }

    async function saveSelectedMCPServerNamesToIndexedDB(fileId: string, serverNames: string[]): Promise<void> {
        if (typeof window === "undefined") {
            return;
        }

        try {
            await setIndexedDBValue(getStorageKeyName(fileId), serverNames);
        }
        catch (err) {
            console.error("Error when writing selected MCP servers to IndexedDB", err);
        }
    }

    async function readSelectedContextFromIndexedDB(fileId: string): Promise<ContextSpecificationPayload> {
        if (typeof window === "undefined") {
            return createEmptyContextPayload();
        }

        try {
            const selectedContext = await getIndexedDBValue(getContextStorageKeyName(fileId));
            if (!isContextSpecificationPayload(selectedContext)) {
                return createEmptyContextPayload();
            }

            return cloneContextPayload(selectedContext);
        }
        catch (err) {
            console.error("Error when reading selected context from IndexedDB", err);
            return createEmptyContextPayload();
        }
    }

    async function saveSelectedContextToIndexedDB(fileId: string, contextPayload: ContextSpecificationPayload): Promise<void> {
        if (typeof window === "undefined") {
            return;
        }

        try {
            await setIndexedDBValue(getContextStorageKeyName(fileId), cloneContextPayload(contextPayload));
        }
        catch (err) {
            console.error("Error when writing selected context to IndexedDB", err);
        }
    }

    const selectedMCPServerNames = (() => {
        const selectedMCPServersValues = createWritableStore<string[]>([]);
        let selectedMCPServersSyncId = 0;

        const setSelectedMCPServerNames = (serverNames: string[], shouldSaveToIndexedDB: boolean) => {
            const availableMCPServers = getMCPServersList(downloadMCPServersSpecification);
            const normalizedServerNames = normalizeSelectedMCPServerNames(serverNames, availableMCPServers);
            selectedMCPServersValues.set(normalizedServerNames);

            if (!shouldSaveToIndexedDB) {
                return;
            }

            const selectedFileId = $selectedFile?.id;
            if (!selectedFileId) {
                return;
            }

            void saveSelectedMCPServerNamesToIndexedDB(selectedFileId, normalizedServerNames);
        };

        $effect(() => {
            const selectedFileId = $selectedFile?.id;
            const availableMCPServers = getMCPServersList(downloadMCPServersSpecification);

            selectedMCPServersSyncId += 1;
            const currentSyncId = selectedMCPServersSyncId;

            if (!selectedFileId) {
                selectedMCPServersValues.set([]);
                return;
            }

            void (async () => {
                const downloadedServerNames = await readSelectedMCPServerNamesFromIndexedDB(selectedFileId);
                if (currentSyncId !== selectedMCPServersSyncId) {
                    return;
                }

                const normalizedServerNames = normalizeSelectedMCPServerNames(downloadedServerNames, availableMCPServers);
                selectedMCPServersValues.set(normalizedServerNames);

                if (!areStringArraysEqual(downloadedServerNames, normalizedServerNames)) {
                    await saveSelectedMCPServerNamesToIndexedDB(selectedFileId, normalizedServerNames);
                }
            })();
        });

        return {
            subscribe: selectedMCPServersValues.subscribe,
            set(serverNames: string[]) {
                setSelectedMCPServerNames(serverNames, true);
            },
            update(updater: (serverNames: string[]) => string[]) {
                const nextServerNames = updater(selectedMCPServersValues.getValue());
                setSelectedMCPServerNames(nextServerNames, true);
            }
        }
    })();

    let selectedFileContextSyncId = 0;

    $effect(() => {
        const selectedFileId = $selectedFile?.id;

        selectedFileContextSyncId += 1;
        const currentSyncId = selectedFileContextSyncId;

        if (isContextSelectionModalOpen && contextModalSelectedFileId && selectedFileId !== contextModalSelectedFileId) {
            isContextSelectionModalOpen = false;
            contextModalSelectedFileId = null;
        }

        if (!selectedFileId) {
            selectedFileContextPayload = createEmptyContextPayload();
            return;
        }

        const cachedContextPayload = getCachedContextPayload(selectedFileId);
        if (cachedContextPayload) {
            selectedFileContextPayload = cachedContextPayload;
            return;
        }

        // Prevent context from one file being displayed for another file while async load is pending.
        selectedFileContextPayload = createEmptyContextPayload();

        void (async () => {
            const downloadedContextPayload = await readSelectedContextFromIndexedDB(selectedFileId);
            if (currentSyncId !== selectedFileContextSyncId) {
                return;
            }

            setCachedContextPayload(selectedFileId, downloadedContextPayload);
            selectedFileContextPayload = cloneContextPayload(downloadedContextPayload);
        })();
    });

    let chatBubblesList = $derived($activeChat?.bubbles ?? []);
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

    function getGeneratingTime(chatBubble: AIChatBubble): string {
        const timeDeltaMs = Date.now() - new Date(chatBubble.createdAt).getTime();
        return `${Math.max(0, timeDeltaMs / 1000).toFixed(1)}s`;
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

    function hasChatIndependentDecision(chatBubble: AIChatBubble): boolean {
        return chatBubble.aiResponse.some((response) => Boolean(response.decision));
    }

    function getAboveBubbleStateColor(chatBubble: AIChatBubble): string {
        if (chatBubble.decision === "accepted") {
            return "border-success text-success";
        }

        if (chatBubble.decision === "declined") {
            return "border-error text-error";
        }

        if (hasChatIndependentDecision(chatBubble)) {
            return "border-info text-info";
        }

        return "border-base-300 text-base-content/70";
    }

    function onLocalAction(decision: AIChatDecision, chatBubbleId: string, aiResponseId: string) {
        if (!$activeChat) {
            return;
        }

        rightSideStripeChat.setResponseDecision($activeChat.id, chatBubbleId, aiResponseId, decision);

        const doesAllResponsesHaveDecision = $activeChat.bubbles
            .find((bubble) => bubble.id === chatBubbleId)
            ?.aiResponse
            .every((response) => response.id === aiResponseId ? Boolean(decision) : Boolean(response.decision));

        if (doesAllResponsesHaveDecision) {
            rightSideStripeChat.setBubbleDecision($activeChat.id, chatBubbleId, decision);
        }
    }

    function onMessageInput(event: Event) {
        const target = event.currentTarget as HTMLDivElement;
        textContent = target.innerText;
    }

    function buildMockResponse(prompt: string, mode: AIChatMode): AIChatResponse[] {
        const now = new Date().toISOString();
        const escapedPrompt = escapeHtml(prompt || "context only prompt");

        return [
            {
                id: crypto.randomUUID(),
                applyTo: mode === "regular-ask" ? "chat" : "selection",
                answerHTML: `<p><strong>Mode:</strong> ${escapeHtml(getTextFieldModeName(mode))}</p><p>Generated response for: ${escapedPrompt}</p>`,
                publishedDate: now
            }
        ];
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

        const appended = rightSideStripeChat.appendPromptBubble({
            prompt: promptText,
            promptHTML,
            mode,
            selectedTextForPrompt: selectedRanges
        });

        if (!appended) {
            return;
        }

        const { chatId, bubbleId } = appended;

        textContent = "";
        composerResetKey += 1;

        editorAIChat.clearSelectedText();
        displayContextForMessages.set([]);
        isSelectedTextPreviewOpen = true;

        setTimeout(() => {
            rightSideStripeChat.applyResponses(chatId, bubbleId, buildMockResponse(promptText, mode));
        }, 900);
    }

    function onToggleMCPServersSelectionModal() {
        isMCPServersSelectionOpen = !isMCPServersSelectionOpen;
    }

    async function onContextSelection() {
        const selectedFileId = $selectedFile?.id;
        if (!selectedFileId) {
            return;
        }

        const cachedContextPayload = getCachedContextPayload(selectedFileId);
        if (cachedContextPayload) {
            selectedFileContextPayload = cachedContextPayload;
        }
        else {
            const downloadedContextPayload = await readSelectedContextFromIndexedDB(selectedFileId);
            if ($selectedFile?.id !== selectedFileId) {
                return;
            }

            setCachedContextPayload(selectedFileId, downloadedContextPayload);
            selectedFileContextPayload = cloneContextPayload(downloadedContextPayload);
        }

        contextModalSelectedFileId = selectedFileId;
        isContextSelectionModalOpen = true;
    }

    function onSaveSelectedFileContext(payload: ContextSpecificationPayload) {
        const fileIdForContext = contextModalSelectedFileId ?? $selectedFile?.id;
        if (!fileIdForContext) {
            return;
        }

        const normalizedPayload = cloneContextPayload(payload);
        setCachedContextPayload(fileIdForContext, normalizedPayload);

        if ($selectedFile?.id === fileIdForContext) {
            selectedFileContextPayload = cloneContextPayload(normalizedPayload);
        }

        void saveSelectedContextToIndexedDB(fileIdForContext, normalizedPayload);
        contextModalSelectedFileId = null;

    }

    function onSelectTaskBarAnswer() {
        $isPointsStripeOpen = true;
        isContextSelectionModalOpen = false;
    }

    // Context answers
    function getContextAnswerTextRepresentation(htmlAnswer: string) {
        const domParsed = new DOMParser().parseFromString(htmlAnswer, "text/html");
        const domText = domParsed.body.textContent;

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
    {:else if chatBubblesList.length}
        <div class="flex flex-col gap-5 pb-1">
            {#each chatBubblesList as chatBubble (chatBubble.id)}
                <article class="rounded-xl border border-base-300 bg-base-200/70 p-2" data-chatBubbleId={chatBubble.id}>
                    <div class="flex items-center justify-between px-1 mb-1">
                        <span class="text-xs text-primary font-semibold">
                            {getTextFieldModeName(chatBubble.mode)}
                        </span>
                        <div class="badge badge-sm gap-1 {getAboveBubbleStateColor(chatBubble)}">
                            {#if chatBubble.decision === "accepted"}
                                <Icon icon="mdi:check" width="12" height="12" />
                            {:else if chatBubble.decision === "declined"}
                                <Icon icon="mdi:close" width="12" height="12" />
                            {:else if hasChatIndependentDecision(chatBubble)}
                                <Icon icon="mdi:code-tags" width="12" height="12" />
                            {:else}
                                <Icon icon="mdi:chevron-down" width="12" height="12" />
                            {/if}
                        </div>
                    </div>

                    <section class="rounded-lg border border-primary/20 bg-base-100 p-2">
                        <div class="text-xs text-base-content/60 font-semibold">Prompt</div>
                        <button class="w-full text-left" onclick={() => onShowOrHidePrompt(chatBubble.id)}>
                            <div class="mt-1 text-sm break-words" class:line-clamp-1={!showFullPromptTextIds.includes(chatBubble.id)}>
                                {#if chatBubble.userPromptHTML}
                                    <span class="whitespace-pre-wrap">{htmlToText(chatBubble.userPromptHTML)}</span>
                                {:else}
                                    <span class="text-base-content/50">No prompt specified (context only)</span>
                                {/if}
                            </div>
                        </button>
                    </section>

                    {#if chatBubble.selectedTextForPrompt?.length}
                        <section class="mt-2 rounded-lg border border-base-300 bg-base-100 p-2">
                            <button class="btn btn-ghost btn-xs px-1" onclick={() => onShowHideMessageContext(chatBubble.id)}>
                                {#if $displayContextForMessages.includes(chatBubble.id)}
                                    <Icon icon="mdi:chevron-up" width="14" height="14" />
                                    <span>Hide message context</span>
                                {:else}
                                    <Icon icon="mdi:chevron-down" width="14" height="14" />
                                    <span>Show message context</span>
                                {/if}
                            </button>
                            {#if $displayContextForMessages.includes(chatBubble.id)}
                                <div class="mt-2 pt-2 border-t border-base-300 flex flex-col gap-2 text-sm">
                                    {#each chatBubble.selectedTextForPrompt as selectedContext (`${selectedContext.id}-${selectedContext.from}-${selectedContext.to}`)}
                                        <div class="rounded-md bg-base-200 p-2 break-all">
                                            <span class="whitespace-pre-wrap">{htmlToText(selectedContext.html)}</span>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </section>
                    {/if}

                    <section class="mt-2 rounded-lg border border-base-300 bg-base-100 p-2">
                        <div class="text-xs text-base-content/60 font-semibold">Answer</div>

                        {#if chatBubble.aiResponse.length}
                            <div class="mt-2 flex flex-col gap-3">
                                {#each chatBubble.aiResponse as aiResponse, aiResponseIndex (aiResponse.id)}
                                    <div class="rounded-lg border border-base-300 bg-base-200/60 p-2">
                                        <div class="text-sm whitespace-pre-wrap break-words">
                                            {htmlToText(aiResponse.answerHTML)}
                                        </div>

                                        <div class="mt-2 flex items-center justify-between">
                                            {#if aiResponse.applyTo !== "chat" && chatBubble.mode !== "regular-ask"}
                                                {#if !aiResponse.decision && !chatBubble.decision}
                                                    <div class="join">
                                                        <button class="btn btn-ghost btn-xs join-item" onclick={() => onLocalAction("accepted", chatBubble.id, aiResponse.id)}>
                                                            <Icon icon="mdi:check" width="14" height="14" />
                                                        </button>
                                                        <button class="btn btn-ghost btn-xs join-item" onclick={() => onLocalAction("declined", chatBubble.id, aiResponse.id)}>
                                                            <Icon icon="mdi:close" width="14" height="14" />
                                                        </button>
                                                    </div>
                                                {:else}
                                                    <span class="text-xs text-base-content/60">Change proposition</span>
                                                {/if}
                                            {:else}
                                                <span class="text-xs text-base-content/60">Chat</span>
                                            {/if}

                                            <span class="text-xs text-base-content/50">
                                                {@render displayDate(aiResponse.publishedDate)}
                                            </span>
                                        </div>

                                        {#if aiResponseIndex !== chatBubble.aiResponse.length - 1}
                                            <div class="mt-2 border-b border-base-300"></div>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        {:else}
                            <div class="mt-2 flex items-center gap-2 text-base-content/60">
                                <span class="loading loading-spinner loading-xs"></span>
                                <span>AI is generating response... {getGeneratingTime(chatBubble)}</span>
                            </div>
                        {/if}
                    </section>
                </article>
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
                {@const allModes = Object.entries(editorAIChat.getModes()) as [AIChatMode, { modeName: string; modeDescription: string; }][]}
                <div class="absolute bottom-[calc(100%+6px)] left-0 z-20 rounded-lg border border-base-300 bg-base-100 shadow-xl p-2 min-w-44">
                    <div class="text-xs text-base-content/60 mb-1">Select mode</div>
                    <div class="flex flex-col gap-1">
                        {#each allModes as [mode, modeValue] (mode)}
                            <div
                                class="tooltip tooltip-right"
                                data-tip={modeValue.modeDescription}
                            >
                                <button
                                    class="btn btn-ghost btn-xs justify-start {mode === $editorAIChat.textFieldMode ? 'btn-active' : ''}"
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
    infoMessage="Context is saved for the currently selected document."
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
            {#each $selectedChatAnswerIds as answerId}
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
