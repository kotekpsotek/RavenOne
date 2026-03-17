<script lang="ts">
    import Icon from "@iconify/svelte";
    import { get } from "svelte/store";
    import { selectedFile } from "$lib/stores/files";
    import {
        activeChat,
        displayContextForMessages,
        editorAIChat,
        rightSideStripeChat,
        rightSideStripeChatLayout,
        type AIChatBubble,
        type AIChatDecision,
        type AIChatMode,
        type AIChatResponse,
        type MermaidDiagramType
    } from "$lib/stores/rightSideStripeChat";

    const mermaidModes: AIChatMode[] = ["visualization", "tldr"];
    type TabDropPosition = "before" | "after";

    let screenWidth = $state(typeof window !== "undefined" ? window.innerWidth : 1440);
    let textContent = $state("");
    let showFullPromptTextIds = $state<string[]>([]);
    let isModeSelectingTrayOpen = $state(false);
    let isMermaidModeSelectionTrayOpen = $state(false);
    let isChatActionsDropdownOpen = $state(false);
    let isSelectChatListOpen = $state(false);
    let isSelectedTextPreviewOpen = $state(true);
    let mouseIsOnPreviewSelectedText = $state<{ from: number; to: number } | null>(null);
    let isResizing = $state(false);
    let resizeAxis = $state<"x" | "y" | null>(null);
    let resizeStartPointer = $state(0);
    let resizeStartSize = $state(0);
    let composerResetKey = $state(0);
    let draggedChatId = $state<string | null>(null);
    let dropTargetChatId = $state<string | null>(null);
    let dropTargetPosition = $state<TabDropPosition | null>(null);
    let chatActionsDropdownPosition = $state<{ top: number; left: number } | null>(null);

    let chatBubblesList = $derived($activeChat?.bubbles ?? []);
    let isMessagingActive = $derived(Boolean($selectedFile && !$rightSideStripeChat.isLoading && $rightSideStripeChatLayout.isOpen));
    let chatStripeWidth = $derived($rightSideStripeChatLayout.width);
    let chatStripeHeight = $derived($rightSideStripeChatLayout.height);

    function escapeHtml(text: string): string {
        return text
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function getPromptHtml(inputText: string): string {
        return escapeHtml(inputText).replaceAll("\n", "<br />");
    }

    function getGeneratingTime(chatBubble: AIChatBubble): string {
        const timeDeltaMs = Date.now() - new Date(chatBubble.createdAt).getTime();
        return `${Math.max(0, timeDeltaMs / 1000).toFixed(1)}s`;
    }

    function onWindowResize() {
        screenWidth = window.innerWidth;

        if (isChatActionsDropdownOpen) {
            updateChatActionsDropdownPosition();
        }
    }

    function onWindowClick(event: MouseEvent) {
        const target = event.target as HTMLElement | null;

        if (!target?.closest("#chat-actions-dropdown")) {
            isChatActionsDropdownOpen = false;
            isSelectChatListOpen = false;
            chatActionsDropdownPosition = null;
        }

        if (target?.closest("#ai-chat")) {
            return;
        }

        isModeSelectingTrayOpen = false;
        isMermaidModeSelectionTrayOpen = false;
    }

    function onTabsScroll(event: WheelEvent) {
        const tabsContainer = event.currentTarget as HTMLDivElement | null;
        if (!tabsContainer) {
            return;
        }

        if (tabsContainer.scrollWidth <= tabsContainer.clientWidth) {
            return;
        }

        // Translate vertical mouse wheel movement into horizontal tab scrolling.
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
            event.preventDefault();
            tabsContainer.scrollLeft += event.deltaY;

            if (isChatActionsDropdownOpen) {
                requestAnimationFrame(updateChatActionsDropdownPosition);
            }
        }
    }

    function onTabsAreaScroll() {
        if (!isChatActionsDropdownOpen) {
            return;
        }

        updateChatActionsDropdownPosition();
    }

    function getChatActionsButtonElement(): HTMLButtonElement | null {
        if (typeof document === "undefined") {
            return null;
        }

        const buttonElement = document.getElementById("tab-add-btn");
        return buttonElement instanceof HTMLButtonElement ? buttonElement : null;
    }

    function updateChatActionsDropdownPosition() {
        if (typeof window === "undefined") {
            return;
        }

        const chatActionsButtonEl = getChatActionsButtonElement();
        if (!chatActionsButtonEl) {
            return;
        }

        const dropdownWidth = 240;
        const viewportPadding = 8;
        const estimatedDropdownHeight = isSelectChatListOpen ? 280 : 112;
        const dropdownOffset = 6;
        const rect = chatActionsButtonEl.getBoundingClientRect();

        const left = Math.max(
            viewportPadding,
            Math.min(window.innerWidth - dropdownWidth - viewportPadding, rect.right - dropdownWidth)
        );

        const canOpenDownward = rect.bottom + dropdownOffset + estimatedDropdownHeight <= window.innerHeight - viewportPadding;
        const top = canOpenDownward
            ? rect.bottom + dropdownOffset
            : Math.max(viewportPadding, rect.top - estimatedDropdownHeight - dropdownOffset);

        chatActionsDropdownPosition = {
            top,
            left
        };
    }

    function clearTabsDragState() {
        draggedChatId = null;
        dropTargetChatId = null;
        dropTargetPosition = null;
    }

    function getDropPositionFromEvent(event: DragEvent): TabDropPosition | null {
        const target = event.currentTarget as HTMLElement | null;
        if (!target) {
            return null;
        }

        const rect = target.getBoundingClientRect();
        if (!rect.width) {
            return "after";
        }

        return event.clientX - rect.left < rect.width / 2 ? "before" : "after";
    }

    function onTabDragStart(event: DragEvent, chatId: string) {
        draggedChatId = chatId;
        dropTargetChatId = null;
        dropTargetPosition = null;

        if (event.dataTransfer) {
            event.dataTransfer.setData("text/plain", chatId);
            event.dataTransfer.effectAllowed = "move";
        }
    }

    function onTabDragOver(event: DragEvent, chatId: string) {
        if (!draggedChatId) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
        }

        if (draggedChatId === chatId) {
            dropTargetChatId = null;
            dropTargetPosition = null;
            return;
        }

        dropTargetChatId = chatId;
        dropTargetPosition = getDropPositionFromEvent(event);
    }

    function onTabDrop(event: DragEvent, targetChatId: string) {
        event.preventDefault();
        event.stopPropagation();

        if (!draggedChatId || draggedChatId === targetChatId) {
            clearTabsDragState();
            return;
        }

        const position = getDropPositionFromEvent(event);
        if (!position) {
            clearTabsDragState();
            return;
        }

        rightSideStripeChat.reorderChats(draggedChatId, targetChatId, position);
        clearTabsDragState();
    }

    function onTabDragEnd() {
        clearTabsDragState();
    }

    function onAddTabDragOver(event: DragEvent) {
        if (!draggedChatId) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
        }

        const lastChatId = $rightSideStripeChat.chats[$rightSideStripeChat.chats.length - 1]?.id;
        if (!lastChatId || lastChatId === draggedChatId) {
            dropTargetChatId = null;
            dropTargetPosition = null;
            return;
        }

        // Add-tab control is fixed at the end; dropping on it means moving before this button.
        dropTargetChatId = lastChatId;
        dropTargetPosition = "after";
    }

    function onAddTabDrop(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();

        const lastChatId = $rightSideStripeChat.chats[$rightSideStripeChat.chats.length - 1]?.id;
        if (!draggedChatId || !lastChatId || draggedChatId === lastChatId) {
            clearTabsDragState();
            return;
        }

        rightSideStripeChat.reorderChats(draggedChatId, lastChatId, "after");
        clearTabsDragState();
    }

    function isDropAtTabsEnd(): boolean {
        if (!$rightSideStripeChat.chats.length) {
            return false;
        }

        const lastChatId = $rightSideStripeChat.chats[$rightSideStripeChat.chats.length - 1].id;
        return dropTargetChatId === lastChatId && dropTargetPosition === "after";
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

    function onResizeStartX(event: MouseEvent) {
        if (screenWidth < 1280) {
            return;
        }

        event.preventDefault();
        resizeAxis = "x";
        resizeStartPointer = event.clientX;
        resizeStartSize = chatStripeWidth;
        isResizing = true;
    }

    function onResizeMove(event: MouseEvent) {
        if (!isResizing || !resizeAxis) {
            return;
        }

        if (resizeAxis === "x") {
            const deltaX = resizeStartPointer - event.clientX;
            rightSideStripeChatLayout.updateWidth(resizeStartSize + deltaX);
            return;
        }

        const deltaY = resizeStartPointer - event.clientY;
        rightSideStripeChatLayout.updateHeight(resizeStartSize + deltaY);
    }

    function onResizeEnd() {
        isResizing = false;
        resizeAxis = null;
    }

    function onSelectChat(chatId: string) {
        rightSideStripeChat.setSelectedChatId(chatId);
    }

    function onCreateChat() {
        const nextMode = $editorAIChat.textFieldMode;
        rightSideStripeChat.createChat(nextMode, `${editorAIChat.getTextFieldModeTranslation(nextMode)} chat`);
    }

    function onToggleChatActionsDropdown(event: MouseEvent) {
        event.stopPropagation();

        isChatActionsDropdownOpen = !isChatActionsDropdownOpen;
        if (isChatActionsDropdownOpen) {
            isModeSelectingTrayOpen = false;
            isMermaidModeSelectionTrayOpen = false;
            updateChatActionsDropdownPosition();
            return;
        }

        isSelectChatListOpen = false;
        chatActionsDropdownPosition = null;
    }

    function onCreateChatFromDropdown() {
        onCreateChat();
        isChatActionsDropdownOpen = false;
        isSelectChatListOpen = false;
        chatActionsDropdownPosition = null;
    }

    function onToggleSelectChatList(event: MouseEvent) {
        event.stopPropagation();
        isSelectChatListOpen = !isSelectChatListOpen;

        requestAnimationFrame(updateChatActionsDropdownPosition);
    }

    function onSelectChatFromDropdown(chatId: string) {
        onSelectChat(chatId);
        isChatActionsDropdownOpen = false;
        isSelectChatListOpen = false;
        chatActionsDropdownPosition = null;
    }

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

    function onMermaidSelect(event: MouseEvent) {
        event.stopPropagation();
        isMermaidModeSelectionTrayOpen = !isMermaidModeSelectionTrayOpen;
        if (isMermaidModeSelectionTrayOpen) {
            isModeSelectingTrayOpen = false;
        }
    }

    function onChoosenMermaidMode(mode: MermaidDiagramType | "none") {
        editorAIChat.setMermaidDiagramType(mode === "none" ? undefined : mode);
        isMermaidModeSelectionTrayOpen = false;
    }

    function getMermaidTypes() {
        return [...Object.entries(editorAIChat.getMermaidTypes()), ["none", "No visualization"]] as [MermaidDiagramType | "none", string][];
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

    function toMermaidTemplate(type: MermaidDiagramType): string {
        if (type === "sequenceDiagram") {
            return [
                "sequenceDiagram",
                "User->>RavenOne: Ask question",
                "RavenOne->>AI: Build response",
                "AI-->>RavenOne: Return proposal",
                "RavenOne-->>User: Display answer"
            ].join("\n");
        }

        if (type === "classDiagram") {
            return [
                "classDiagram",
                "class File {",
                "  +id: string",
                "  +content: string",
                "}",
                "class ChatThread {",
                "  +id: string",
                "  +mode: string",
                "}",
                "File --> ChatThread : owns"
            ].join("\n");
        }

        if (type === "stateDiagram-v2") {
            return [
                "stateDiagram-v2",
                "[*] --> Draft",
                "Draft --> Sent: send",
                "Sent --> Accepted: accept",
                "Sent --> Declined: decline"
            ].join("\n");
        }

        return [
            "flowchart TD",
            "A[Prompt] --> B[Model processing]",
            "B --> C[Text answer]",
            "B --> D[Optional Mermaid]"
        ].join("\n");
    }

    function buildMockResponse(prompt: string, mode: AIChatMode): AIChatResponse[] {
        const now = new Date().toISOString();
        const escapedPrompt = escapeHtml(prompt || "context only prompt");
        const selectedMermaid = get(editorAIChat).mermaidDiagramType;
        const includeMermaid = mode === "visualization" && Boolean(selectedMermaid);

        return [
            {
                id: crypto.randomUUID(),
                applyTo: mode === "regular-ask" ? "chat" : "selection",
                answerHTML: `<p><strong>Mode:</strong> ${escapeHtml(editorAIChat.getTextFieldModeTranslation(mode))}</p><p>Generated response for: ${escapedPrompt}</p>`,
                publishedDate: now,
                ...(includeMermaid
                    ? {
                        mermaid: {
                            type: selectedMermaid!,
                            definition: toMermaidTemplate(selectedMermaid!)
                        }
                    }
                    : {})
            }
        ];
    }

    function onSendMessage() {
        if (!isMessagingActive) {
            return;
        }

        const promptText = textContent.trim();
        const selectedRanges = get(editorAIChat).selectedText?.ranges ?? [];
        if (!promptText && !selectedRanges.length) {
            return;
        }

        const promptHTML = getPromptHtml(promptText);
        const mode = get(editorAIChat).textFieldMode;

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

    function onMermaidClick(definition?: string, type?: MermaidDiagramType) {
        if (!definition || !type) {
            return;
        }

        const previewWindow = window.open("", "_blank", "width=900,height=640");
        if (!previewWindow) {
            return;
        }

        previewWindow.document.write(`<pre>${escapeHtml(definition)}</pre>`);
        previewWindow.document.title = `Mermaid (${type})`;
    }

    // TODO:
    function onShowChatsList() {

    }
    
    // hooks
    function useChatHistory(el: HTMLDivElement) {
        const btmInteractionsElement = el.parentElement?.querySelector("#bottom-interactions");
        if (btmInteractionsElement) {
            el.style.paddingBottom = `${btmInteractionsElement.clientHeight}px`;
        }

        return {}
    }
</script>

<svelte:window onresize={onWindowResize} onmousemove={onResizeMove} onmouseup={onResizeEnd} onclick={onWindowClick} />

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
    id="ai-chat"
    class="ai-chat border border-base-300 bg-base-200 shadow-sm relative flex flex-col min-h-0 {isResizing ? 'select-none' : ''}"
    style={screenWidth >= 1280 ? `width: ${chatStripeWidth}px;` : `height: ${chatStripeHeight}px;`}
>
    {#if screenWidth >= 1280}
        <button
            type="button"
            class="absolute h-full left-0 top-0 z-[100] h-full w-1 cursor-ew-resize hover:bg-primary/30 {isResizing ? "bg-primary/50" : ""}"
            onmousedown={onResizeStartX}
            aria-label="Resize chat width"
        ></button>
    {/if}

    <div class="card-body p-0 min-h-0 pt-3" style="gap: 0px;">
        <div class="flex items-center justify-between gap-2 px-2">
            <div class="flex items-center gap-2">
                <button
                    class="btn btn-ghost btn-square"
                    aria-label="Hide AI chat"
                    onclick={onShowChatsList}   
                >
                    <Icon icon="material-symbols:chat-bubble-outline-rounded" class="text-lg"/>
                </button>
                <h2 class="font-semibold">RavenOne AI Chat</h2>
            </div>
            <button class="btn btn-primary btn-xs" onclick={onCreateChat}>
                <Icon icon="mdi:plus" width="14" height="14" />
                <span>New chat</span>
            </button>
        </div>

        <!-- Make from this element the component -->
        <div class="tabs-scroll-area overflow-x-auto overflow-y-visible mt-3 pb-1" onwheel={onTabsScroll} onscroll={onTabsAreaScroll}>
            <div class="tabs tabs-lift bg-base-200 flex flex-nowrap min-w-max">
                {#each $rightSideStripeChat.chats as chat (chat.id)}
                    <button
                        class="tab chat-tab whitespace-nowrap gap-2 flex-nowrap {chat.id === $rightSideStripeChat.selectedChatId ? 'tab-active' : ''} {draggedChatId === chat.id ? 'opacity-70' : ''} {dropTargetChatId === chat.id && dropTargetPosition === 'before' ? 'chat-tab-drop-before' : ''} {dropTargetChatId === chat.id && dropTargetPosition === 'after' ? 'chat-tab-drop-after' : ''}"
                        draggable="true"
                        ondragstart={(event) => onTabDragStart(event, chat.id)}
                        ondragover={(event) => onTabDragOver(event, chat.id)}
                        ondrop={(event) => onTabDrop(event, chat.id)}
                        ondragend={onTabDragEnd}
                        onclick={() => onSelectChat(chat.id)}
                    >
                        <span class="truncate max-w-[120px]">{chat.title}</span>
                        
                        {#if chat.id === $rightSideStripeChat.selectedChatId}
                            <span class="inline-flex items-center opacity-70">
                                <Icon icon="material-symbols:close-rounded" class="text-lg"/>
                            </span>
                        {/if}
                    </button>
                {/each}
                <div id="chat-actions-dropdown" class="relative ml-1">
                    <button
                        id="tab-add-btn"
                        type="button"
                        class="tab chat-tab whitespace-nowrap {isDropAtTabsEnd() ? 'chat-tab-drop-before' : ''}"
                        draggable="false"
                        ondragover={onAddTabDragOver}
                        ondrop={onAddTabDrop}
                        aria-haspopup="menu"
                        aria-expanded={isChatActionsDropdownOpen}
                        onclick={onToggleChatActionsDropdown}
                    >
                        <Icon icon="material-symbols:add-2-rounded"/>
                    </button>

                    {#if isChatActionsDropdownOpen}
                        <div
                            class="fixed z-[250] w-60 rounded-lg border border-base-300 bg-base-100 p-1 shadow-xl"
                            style={`top: ${chatActionsDropdownPosition?.top ?? 0}px; left: ${chatActionsDropdownPosition?.left ?? 0}px;`}
                        >
                            <button
                                type="button"
                                class="btn btn-ghost btn-sm w-full justify-start"
                                onclick={onCreateChatFromDropdown}
                            >
                                <Icon icon="mdi:plus" width="14" height="14" />
                                <span>New chat</span>
                            </button>

                            <button
                                type="button"
                                class="btn btn-ghost btn-sm w-full justify-between"
                                onclick={onToggleSelectChatList}
                            >
                                <span>Select Chat from List</span>
                                <Icon icon={isSelectChatListOpen ? "mdi:chevron-up" : "mdi:chevron-down"} width="14" height="14" />
                            </button>

                            {#if isSelectChatListOpen}
                                <div class="mt-1 max-h-48 overflow-y-auto border-t border-base-300 pt-1">
                                    {#if $rightSideStripeChat.chats.length}
                                        {#each $rightSideStripeChat.chats as chat (chat.id)}
                                            <button
                                                type="button"
                                                class="btn btn-ghost btn-sm w-full justify-start {chat.id === $rightSideStripeChat.selectedChatId ? 'btn-active' : ''}"
                                                onclick={() => onSelectChatFromDropdown(chat.id)}
                                            >
                                                <span class="truncate">{chat.title}</span>
                                            </button>
                                        {/each}
                                    {:else}
                                        <p class="px-2 py-1 text-xs text-base-content/60">No chats available</p>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>
            </div>
        </div>

        <div class="relative h-full border-x border-base-300 bg-base-100">
            <div 
                id="ai-chat-history"
                class="h-full flex-1 min-h-0 overflow-y-auto pr-1"
                use:useChatHistory
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
                                        {editorAIChat.getTextFieldModeTranslation(chatBubble.mode)}
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

                                                    {#if aiResponse.mermaid && mermaidModes.includes(chatBubble.mode)}
                                                        <div class="mt-2 rounded-md border border-info/30 bg-base-100 p-2">
                                                            <div class="text-xs font-semibold text-info">Mermaid ({editorAIChat.getMermaidTypes()[aiResponse.mermaid.type]})</div>
                                                            <button class="btn btn-ghost btn-xs mt-1" onclick={() => onMermaidClick(aiResponse.mermaid?.definition, aiResponse.mermaid?.type)}>
                                                                <Icon icon="mdi:eye-outline" width="14" height="14" />
                                                                <span>Preview mermaid source</span>
                                                            </button>
                                                            <pre class="mt-2 text-xs whitespace-pre-wrap bg-base-200 p-2 rounded">{aiResponse.mermaid.definition}</pre>
                                                        </div>
                                                    {/if}

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
                        <div class="h-fit w-fit flex flex-col justify-center items-center">
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
                            {@const allModes = Object.entries(editorAIChat.getModes()) as [AIChatMode, string][]}
                            <div class="absolute bottom-[calc(100%+6px)] left-0 z-20 rounded-lg border border-base-300 bg-base-100 shadow-xl p-2 min-w-44">
                                <div class="text-xs text-base-content/60 mb-1">Select mode</div>
                                <div class="flex flex-col gap-1">
                                    {#each allModes as [mode, modeName] (mode)}
                                        <button
                                            class="btn btn-ghost btn-xs justify-start {mode === $editorAIChat.textFieldMode ? 'btn-active' : ''}"
                                            onclick={() => onSelectNewMode(mode)}
                                        >
                                            {modeName}
                                        </button>
                                    {/each}
                                </div>
                            </div>
                        {/if}

                        <!-- Mode ignite btn -->
                        <button class="btn btn-ghost btn-xs" disabled={!isMessagingActive} onclick={onClickSelectMode}>
                            <Icon icon="mdi:at" width="14" height="14" />
                            <span>{editorAIChat.getTextFieldModeTranslation($editorAIChat.textFieldMode)}</span>
                        </button>

                        <!-- Visualization modes selection btn -->
                        {#if $editorAIChat.textFieldMode === "visualization" || $editorAIChat.textFieldMode === "tldr"}
                            {#if isMermaidModeSelectionTrayOpen}
                                {@const mermaidTypes = getMermaidTypes()}
                                <div class="absolute bottom-[calc(100%+6px)] left-0 z-20 rounded-lg border border-base-300 bg-base-100 shadow-xl p-2 min-w-44">
                                    <div class="text-xs text-base-content/60 mb-1">Select diagram</div>
                                    <div class="flex flex-col gap-1">
                                        {#each mermaidTypes as [mode, modeName] (mode)}
                                            <button class="btn btn-ghost btn-xs justify-start" onclick={() => onChoosenMermaidMode(mode)}>
                                                {modeName}
                                            </button>
                                        {/each}
                                    </div>
                                </div>
                            {/if}

                            <button 
                                id="interaction-tab"
                                class="tab btn btn-ghost btn-xs"
                                disabled={!isMessagingActive}
                                onclick={onMermaidSelect}
                            >
                                <Icon icon="mdi:graph-outline" width="14" height="14" />
                                <span>
                                    {#if $editorAIChat.mermaidDiagramType}
                                        {editorAIChat.getMermaidTypes()[$editorAIChat.mermaidDiagramType]}
                                    {:else}
                                        No visualization
                                    {/if}
                                </span>
                            </button>

                            <!--  -->
                        {/if}

                        <!-- Context selection btn -->
                        <button
                            class="btn btn-ghost btn-xs"
                            title="Context specification" 
                            disabled={!isMessagingActive}
                        >
                            <Icon icon="material-symbols:note-stack-outline-rounded" width="14" height="14"/>
                        </button>
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
        </div>
    </div>
</div>

<style>
    .tabs-scroll-area {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }

    .tabs-scroll-area::-webkit-scrollbar {
        display: none;
    }

    .chat-tab {
        position: relative;
    }

    .chat-tab-drop-before::before,
    .chat-tab-drop-after::after {
        content: "";
        position: absolute;
        top: 18%;
        height: 64%;
        width: 2px;
        background: oklch(var(--p));
        border-radius: 999px;
    }

    .chat-tab-drop-before::before {
        left: -1px;
    }

    .chat-tab-drop-after::after {
        right: -1px;
    }

    #writable-for-chat:empty::before {
        content: attr(data-placeholder);
        color: color-mix(in oklab, var(--fallback-bc, oklch(var(--bc) / 1)) 55%, transparent);
        pointer-events: none;
    }
</style>
