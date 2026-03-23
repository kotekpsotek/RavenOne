<script lang="ts">
    import Icon from "@iconify/svelte";
    import Chat from "./Chat.svelte";
    import ChatsList from "./ChatsList.svelte";
    import ChatTabs from "./ChatTabs.svelte";
    import { chatLayoutStore } from "./config";
    import { activeChat, editorAIChat, rightSideStripeChat } from "$lib/stores/aiRightSideChat";

    let screenWidth = $state(typeof window !== "undefined" ? window.innerWidth : 1440);
    /** Shows chats-list or the list with chat bubbles */
    let isChatsListSectionOpen = $state(false);
    let isModeSelectingTrayOpen = $state(false);
    let isMermaidModeSelectionTrayOpen = $state(false);
    let isResizing = $state(false);
    let resizeAxis = $state<"x" | "y" | null>(null);
    let resizeStartPointer = $state(0);
    let resizeStartSize = $state(0);
    

    let chatStripeWidth = $derived($chatLayoutStore.width);
    let chatStripeHeight = $derived($chatLayoutStore.height);

    function onWindowResize() {
        screenWidth = window.innerWidth;
    }

    function onWindowClick(event: MouseEvent) {
        const target = event.target as HTMLElement | null;

        if (target?.closest("#ai-chat")) {
            return;
        }

        isModeSelectingTrayOpen = false;
        isMermaidModeSelectionTrayOpen = false;
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
            chatLayoutStore.updateWidth(resizeStartSize + deltaX);
            return;
        }

        const deltaY = resizeStartPointer - event.clientY;
        chatLayoutStore.updateHeight(resizeStartSize + deltaY);
    }

    function onResizeEnd() {
        isResizing = false;
        resizeAxis = null;
    }

    function onCreateChat() {
        const nextMode = $editorAIChat.textFieldMode;
        const newChatId = rightSideStripeChat.createChat(nextMode, `${editorAIChat.getTextFieldModeTranslation(nextMode)} chat`);

        if (newChatId && isChatsListSectionOpen) {
            rightSideStripeChat.setSelectedChatId(newChatId);
            isChatsListSectionOpen = false;
        }
    }

    function onShowChatsList() {
        isChatsListSectionOpen = !isChatsListSectionOpen;
    }

    function onOpenChatFromList() {
        isChatsListSectionOpen = false;
    }
</script>

<svelte:window onresize={onWindowResize} onmousemove={onResizeMove} onmouseup={onResizeEnd} onclick={onWindowClick} />

<div
    id="ai-chat"
    class="ai-chat border border-base-300 bg-base-200 shadow-sm relative flex flex-col min-h-0 {isResizing ? 'select-none' : ''}"
    style={screenWidth >= 1280 ? `width: ${chatStripeWidth}px;` : ``}
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
                    class:btn-active={isChatsListSectionOpen}
                    aria-label="Hide AI chat"
                    onclick={onShowChatsList}   
                >
                    <Icon icon="material-symbols:chat-bubble-outline-rounded" class="text-lg"/>
                </button>
                <h2 class="font-semibold">RavenOne AI Chat</h2>
            </div>

            <div>
                {#if $activeChat?.promptIdProcessing}
                    <span class="loading loading-spinner loading-xs mr-2"></span>
                {/if}

                <button class="btn btn-primary btn-xs" onclick={onCreateChat}>
                    <Icon icon="mdi:plus" width="14" height="14" />
                    <span>New chat</span>
                </button>
            </div>
        </div>

        {#if !isChatsListSectionOpen}
            <ChatTabs/>
        {/if}

        <div class="relative flex flex-1 min-h-0 flex-col border-x border-base-300 bg-base-100">
            {#if isChatsListSectionOpen}
                <ChatsList onOpenChat={onOpenChatFromList} />
            {:else}
                <Chat
                    bind:isModeSelectingTrayOpen
                    bind:isMermaidModeSelectionTrayOpen
                />
            {/if}
        </div>
    </div>
</div>

<style>
    #ai-chat {
        --chat-tabs-max-h: 2.75rem;
        --chat-bottom-interactions-max-h: min(48%, 22rem);
    }
</style>

