<script lang="ts">
    import { onDestroy } from "svelte";
    import Icon from "@iconify/svelte";
    import { createEditor, EditorContent } from "svelte-tiptap";
    import StarterKit from "@tiptap/starter-kit";
    import type { MessageUserPrompt } from "@ravenlens/shared/chat-ai/backend/schema";
    import ModelModelAndTime from "./ModelModelAndTime.svelte";
    import { copyTextToClipboard, htmlToPlainText } from "./copyText";

    const {
        message = $bindable()
    }: { message: MessageUserPrompt } = $props();
    const { 
        id,
        model,
        context,
        isStopped,
        aiChatMode,
        messageContentHTML,
        time,
        isAnswering
    } = $derived(message);
    let displayContext = $derived(context as (MessageUserPrompt["context"] & import("@ravenlens/shared").File.FileAI.PromptContextPayload) | undefined);

    let contextMenu = $state<{ x: number; y: number } | null>(null);

    /** Answer Editor */
    const answerEditor = createEditor({
        content: "<p></p>",
        editable: false,
        extensions: [StarterKit]
    });
    let lastAppliedContent = "";

    $effect(() => {
        const editor = $answerEditor;
        if (!editor) {
            return;
        }

        const nextContent = messageContentHTML;
        if (lastAppliedContent === nextContent) {
            return;
        }

        lastAppliedContent = nextContent;
        editor.commands.setContent(nextContent, { emitUpdate: false });
    });

    onDestroy(() => {
        const editor = $answerEditor;
        editor?.destroy();
    });

    function closeContextMenu() {
        contextMenu = null;
    }

    function onBubbleContextMenu(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        contextMenu = {
            x: event.clientX,
            y: event.clientY
        };
    }

    function onWindowClick(event: MouseEvent) {
        if (!contextMenu) {
            return;
        }

        const target = event.target as HTMLElement | null;
        if (target?.closest('.bubble-copy-context-menu')) {
            return;
        }

        closeContextMenu();
    }

    function onWindowKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            closeContextMenu();
        }
    }

    function getContextMenuStyle() {
        if (!contextMenu) {
            return "";
        }

        const preferredLeft = Math.min(contextMenu.x, Math.max(8, window.innerWidth - 180));
        const preferredTop = Math.min(contextMenu.y, Math.max(8, window.innerHeight - 64));

        return `left: ${preferredLeft}px; top: ${preferredTop}px;`;
    }

    async function onCopyText() {
        const textToCopy = htmlToPlainText(messageContentHTML);
        await copyTextToClipboard(textToCopy);
        closeContextMenu();
    }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown} />

<div
    class="bubble-wrapper flex flex-col items-end gap-1 w-full"
    role="group"
    aria-label="User message"
    oncontextmenu={onBubbleContextMenu}
>
    <div
        class="bubble flex flex-col gap-3 min-w-[300px] max-w-3/4 bg-base-300 p-2 rounded-lg"
        class:stoped={isStopped}
        data-message-id={id}
    >
        <div class="message text-[16px] text-pretty">
            {#if isStopped}
                <div class="flex mb-2 gap-2 items-center text-error">
                    <Icon icon="material-symbols:stop-circle-outline-rounded"/>
                    <span>Stopped</span>
                </div>
            {/if}

            <EditorContent
                editor={$answerEditor}
            />
        </div>

        <!-- Mode, Model and Time -->
        <ModelModelAndTime
            {model}
            {aiChatMode}
            {time}
            {isAnswering}
        />
    </div>

    {#if displayContext && (displayContext.desktopFiles?.length || displayContext.editorFiles?.length || displayContext.networkUrls?.length || displayContext.selectedTextRanges?.length || displayContext.aiAnswers?.length)}
        <div class="context-info flex flex-wrap justify-end gap-1 max-w-3/4">
            {#if displayContext.desktopFiles?.length}
                {#each displayContext.desktopFiles as file, index (index)}
                    <div class="badge badge-neutral badge-xs py-2 gap-1">
                        <Icon icon="mdi:file-document-outline" />
                        {file.name}
                    </div>
                {/each}
            {/if}
            {#if displayContext.editorFiles?.length}
                {#each displayContext.editorFiles as file, index (index)}
                    <div class="badge badge-neutral badge-xs py-2 gap-1">
                        <Icon icon="mdi:code-braces" />
                        {file.name}
                    </div>
                {/each}
            {/if}
            {#if displayContext.networkUrls?.length}
                {#each displayContext.networkUrls as url, index (index)}
                    <div class="badge badge-neutral badge-xs py-2 gap-1">
                        <Icon icon="mdi:web" />
                        {url.url}
                    </div>
                {/each}
            {/if}
            {#if displayContext.selectedTextRanges?.length}
                {#each displayContext.selectedTextRanges as range, index (index)}
                    <div class="badge badge-neutral badge-xs py-2 gap-1">
                        <Icon icon="mdi:format-text" />
                        Text snippet
                    </div>
                {/each}
            {/if}
            {#if displayContext.aiAnswers?.length}
                {#each displayContext.aiAnswers as answer, index (index)}
                    <div class="badge badge-neutral badge-xs py-2 gap-1">
                        <Icon icon="material-symbols:smart-toy-outline" />
                        AI Answer
                    </div>
                {/each}
            {/if}
        </div>

    {/if}

    {#if contextMenu}
        <div
            class="bubble-copy-context-menu fixed z-50 min-w-44 rounded-lg border border-base-300 bg-base-100 p-1 shadow-xl"
            style={getContextMenuStyle()}
        >
            <button
                class="btn btn-ghost btn-sm w-full justify-start gap-2"
                onclick={onCopyText}
            >
                <Icon icon="mdi:content-copy" width="16" height="16" />
                <span>Copy Text</span>
            </button>
        </div>
    {/if}
</div>

<style>
    .bubble.stoped {
        border: 1px dashed var(--color-error);
    }
</style>
