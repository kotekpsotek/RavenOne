<script lang="ts">
    import { onDestroy } from "svelte";
    import Icon from "@iconify/svelte";
    import { createEditor, EditorContent } from "svelte-tiptap";
    import StarterKit from "@tiptap/starter-kit";
    import type { MessageOutput, ReasoningPhases } from "@ravenlens/shared/chat-ai/backend/schema";
    import {
		Timeline,
		TimelineItem,
		TimelineSeparator,
		TimelineDot,
		TimelineConnector,
		TimelineContent,
		TimelineOppositeContent
	} from 'svelte-vertical-timeline';
    import "./AIResponse.css";
    import ModelModelAndTime from "./ModelModelAndTime.svelte";
    import { alertState } from "$lib/utils/alert";
    import { isCurrentUserSelectedFileEditor } from "$lib/stores/collaboration";
    import { activeChat, fileChatEditionPreviewShowing } from "$lib/stores/aiRightSideChat";
    import { callAcceptDocumentManipulation, callAcceptTasksManipulation, callDeclineDocumentManipulation, callDeclineTasksManipulation } from "../proposals/utilFunctions";
    import { isPointsStripeOpen } from "$lib/stores/selectedSideStripes";
    import { copyTextToClipboard, htmlToPlainText } from "./copyText";
    import { normalizeLinkValue } from "$lib/editorComponents/LinkMark";

    const {
        message = $bindable()
    }: { message: MessageOutput } = $props();
    const { 
        id,
        model,
        isStopped,
        isError,
        messageContentHTML,
        documentManipulation,
        tasksListManipulation,
        reasoning,
        aiChatMode,
        time,
        isAnswering
    } = $derived(message);

    let isMessageOpen = $state(true);
    let isProgressTrayOpen = $state(true);
    const liveReasoningLimit = 8;
    const visibleReasoning = $derived.by(() => {
        if (!isAnswering) {
            return reasoning;
        }

        return reasoning.slice(-liveReasoningLimit);
    });
    const hiddenReasoningCount = $derived(Math.max(0, reasoning.length - visibleReasoning.length));

    // Defined whetther the preview of changes is showing for the selected element
    let contextMenu = $state<{ x: number; y: number } | null>(null);
    const previewShowing = $derived($fileChatEditionPreviewShowing);
    const isThisMessagePreview = $derived(previewShowing?.chatId === $activeChat.id && previewShowing?.outputMessage.id === message.id);
    const isDocumentManipulationShowing = $derived(isThisMessagePreview && previewShowing?.type === "document-manipulation");
    const isTasksManipulationShowing = $derived(isThisMessagePreview && previewShowing?.type === "tasks-manipulation");

    /** Answer Editor */
    const answerEditor = createEditor({
        content: "<p></p>",
        editable: false,
        extensions: [StarterKit]
    });
    let lastAppliedContent = "";

    function openLink(href: string, target: string | null) {
        if (target === "_self") {
            window.location.assign(href);
            return;
        }

        window.open(href, target ?? "_blank", "noopener,noreferrer");
    }

    function onEditorClick(event: MouseEvent) {
        const target = event.target as HTMLElement | null;
        const anchor = target?.closest("a[href]");

        if (!anchor) {
            return;
        }

        const href = normalizeLinkValue(anchor.getAttribute("href"));
        if (!href) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const linkTarget = normalizeLinkValue(anchor.getAttribute("target"));
        const targetLabel = linkTarget === "_self" ? "this page" : "a new tab";

        alertState.set({
            alert: {
                type: "info",
                name: "External link",
                description: `You will be redirected to ${href} in ${targetLabel}.`,
                btns: [
                    {
                        name: "Open link",
                        classStyle: "btn-primary",
                        onClick: () => openLink(href, linkTarget)
                    }
                ]
            },
            timeoutMs: 0
        });
    }

    function linkClickDelegation(node: HTMLElement) {
        const handleClick = (event: MouseEvent) => onEditorClick(event);

        node.addEventListener("click", handleClick);

        return () => {
            node.removeEventListener("click", handleClick);
        };
    }

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

    const getReasoningPresentation = (reason: ReasoningPhases) => {
        if (reason.phase === "thinking") {
            const thoughts = reason.thoughts instanceof Array ? reason.thoughts : [reason.thoughts];
            return {
                icon: "material-symbols:psychology-outline",
                name: "Thinking",
                thoughts: thoughts.filter((thought): thought is string => typeof thought === "string" && thought.trim().length > 0)
            };
        }

        if (reason.phase === "tools-usage") {
            return {
                icon: "tabler:tools",
                name: "Tools",
                description: `Called tools: [${reason.tools.map(tool => tool.toolName).join(", ")}]` // with parameter(s) [${reason.tools.map(tool => JSON.stringify(tool.params))}]
            };
        }

        return {
            icon: "material-symbols:checklist-rtl",
            name: "Todo",
            description: reason.todo.map(todoPoint => `${todoPoint.event}: ${todoPoint.content}`).join("\n")
        };
    };

    function onToggleDocumentManipulation() {
        if (!isDocumentManipulationShowing) {
            console.log('Preview message', message)
            fileChatEditionPreviewShowing.setFileAsPreviewing($activeChat.id, message, "document-manipulation")

        }
        else fileChatEditionPreviewShowing.unsetPreviewing();
    }

    function onToggleTasksManipulation() {
        /** 
         * TODO:
         * 1. Open tasks tray if isn't open
         * 2. Show there the presentation of changes 
         * 3. Hide tray after closing if wasn't shown there
        */
       // Setup tray as open
       
       if (!isTasksManipulationShowing) {
           // Setup points previewing
           fileChatEditionPreviewShowing.setFileAsPreviewing($activeChat.id, message, "tasks-manipulation");
           
           isPointsStripeOpen.set(true);
        }
        else fileChatEditionPreviewShowing.unsetPreviewing();
    }

</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown} />

{#snippet ManipulationTray(version: "document" | "tasks")}
    {@const targetElement = version === "document" ? documentManipulation : tasksListManipulation}
    {@const title = `${version === "document" ? "Document" : "Tasks List"} Edition Proposal`}
    {@const isOpen = version === "document" ? isDocumentManipulationShowing : isTasksManipulationShowing}
    {@const handler = version === "document" ? onToggleDocumentManipulation : onToggleTasksManipulation}

    <!-- HANDLERS of manipluation -->
    {@const acceptAnswerHandler = version === "document" ? callAcceptDocumentManipulation : callAcceptTasksManipulation}
    {@const declineAnswerHandler = version === "document" ? callDeclineDocumentManipulation : callDeclineTasksManipulation}

    <!-- LAYOUT -->
    <div class="p-2 bg-base-200 border border-base-300 rounded-lg">
        <h3 class="text-[17px] font-semibold">{title}</h3>

        <div 
            class="wrapper mt-2"
        >
            {#if targetElement?.status === "not-resolved"}
                <div
                    class="flex justify-between items-center gap-5"
                >
                    {#if targetElement!.status === "not-resolved"}
                        <button
                            class="btn btn-sm {!isOpen ? "btn-primary" : "btn-neutral"}"
                            disabled={$fileChatEditionPreviewShowing !== undefined && !fileChatEditionPreviewShowing.isChatIdPreviewingMessageOutput($activeChat.id, message, version === "document" ? "document-manipulation" : "tasks-manipulation")}
                            onclick={handler}
                        >
                            {isOpen ? "Hide" : "Show"} Preview(s)
                        </button>

                        <div
                            class="flex gap-2 items-center"
                        >
                            <button
                                class="btn btn-sm btn-outline btn-success"
                                disabled={!$isCurrentUserSelectedFileEditor}
                                onclick={acceptAnswerHandler(message)}
                            >
                                <Icon icon=""/>
                                <span>Accept</span>
                            </button>

                            <button
                                class="btn btn-sm btn-outline btn-error"
                                disabled={!$isCurrentUserSelectedFileEditor}
                                onclick={declineAnswerHandler(message)}
                            >
                                <Icon icon=""/>
                                <span>Decline</span>
                            </button>
                        </div>
                    {/if}
                </div>
            {:else if targetElement?.status === "accepted"}
                <button class="btn btn-sm btn-success">
                    Accepted
                </button>
            {:else if targetElement?.status === "declined"}
                <button class="btn btn-sm btn-error">
                    Declined
                </button>
            {/if}
        </div>
    </div>
{/snippet}

<div
    class="bubble-wrapper flex justify-end items-center"
    role="group"
    aria-label="Assistant message"
    oncontextmenu={onBubbleContextMenu}
>
    <div
        class="bubble border-t pt-2 rounded-t-none border-base-300 flex flex-col gap-3 w-full p-2 rounded-lg"
        class:stoped={isStopped}
        class:error={isError !== undefined}
        data-message-id={id}
    >
        <div 
            class="upper-stripe flex justify-between"
        >
            <div class="flex items-center justify-center gap-2">
                <div class="w-[40px] h-[40px] p-2 flex items-center justify-center rounded-full bg-base-200">
                    <img
                        class="max-w-full max-h-full object-contain"
                        src="./favicon.svg"
                        alt=""
                    />
                </div>
                <span class="text-[16px] font-semibold">RavenOne</span>
            </div>
        
            <button
                class="text-[20px]"
                onclick={_ => isMessageOpen = !isMessageOpen}
            >
                <Icon 
                    icon={isMessageOpen ? "material-symbols:keyboard-arrow-down-rounded" : "material-symbols:keyboard-arrow-up-rounded"}
                />
            </button>
        </div>

        {#if isMessageOpen}
            <!-- Show once reason steps are defined for the action -->
            {#if visibleReasoning.length && !isError}
                <div 
                    class="progress-outcome border border-base-300 rounded-md bg-base-200 p-2"
                >
                    <button 
                        class="head-stripe w-full flex justify-between text-[15px]"
                        onclick={_ => isProgressTrayOpen = !isProgressTrayOpen}
                    >
                        <h3 class="font-bold">Progress</h3>
                        
                        <span>
                            <Icon 
                                icon={isProgressTrayOpen ? "material-symbols:keyboard-arrow-down-rounded" : "material-symbols:keyboard-arrow-up-rounded"}
                                class="text-[20px]"
                            />
                        </span>
                    </button>

                    {#if isProgressTrayOpen}
                        <div class="content max-h-[200px] overflow-y-auto">
                            {#if isAnswering}
                                <div class="flex flex-col gap-3 py-2">
                                    {#if hiddenReasoningCount > 0}
                                        <p class="text-xs opacity-60">Showing the latest {visibleReasoning.length} updates while the model is responding.</p>
                                    {/if}

                                    {#each visibleReasoning as reason, index (index)}
                                        {@const meta = getReasoningPresentation(reason)}
                                        <div class="live-progress-item rounded-md border border-base-300 bg-base-100 px-3 py-2">
                                            <div class="flex items-center gap-2">
                                                <Icon icon={meta.icon} class="text-[15px] shrink-0" />
                                                <h5 class="font-semibold">{meta.name}</h5>
                                            </div>

                                            <div class="mt-1 text-sm opacity-80">
                                                {#if meta.thoughts}
                                                    <ol class="list-decimal pl-4 space-y-1">
                                                        {#each meta.thoughts as thought (thought)}
                                                            <li>{thought}</li>
                                                        {/each}
                                                    </ol>
                                                {:else}
                                                    <p class="whitespace-pre-wrap">{meta.description}</p>
                                                {/if}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            {:else}
                                <Timeline style="padding: 0;">
                                    {#each visibleReasoning as reason, index (index)}
                                        {@const meta = getReasoningPresentation(reason)}
                                        <TimelineItem position="right">
                                            <TimelineOppositeContent slot="opposite-content" style="display: none !important; width: 0; flex: 0; margin: 0; padding: 0;" />
                                            <TimelineSeparator>
                                                <TimelineDot style="background: none; width: 35px; height: 35px; border-color: var(--color-base-200);">
                                                    <div class="flex items-center justify-center w-[25px] h-[25px] rounded-full bg-base-100 text-base-content shadow-sm">
                                                        <Icon icon={meta.icon} class="text-[15px]" />
                                                    </div>
                                                </TimelineDot>
                                                <TimelineConnector />
                                            </TimelineSeparator>
                                            <TimelineContent>
                                                <h5 class="font-semibold">{meta.name}</h5>
                                                <div class="timeline-content-details prose-xs">
                                                    {#if meta.thoughts}
                                                        <ol class="list-decimal pl-4 space-y-1">
                                                            {#each meta.thoughts as thought (thought)}
                                                                <li class="opacity-80">{thought}</li>
                                                            {/each}
                                                        </ol>
                                                    {:else}
                                                        <p class="whitespace-pre-wrap">{meta.description}</p>
                                                    {/if}
                                                </div>
                                            </TimelineContent>
                                        </TimelineItem>
                                    {/each}
                                </Timeline>
                            {/if}
                        </div>
                    {/if}
                </div>
            {/if}
        
            <!-- Content -->
            <div class="message-output text-[16px]">
                {#if isError}
                    <p class="text-error">
                        <span class="font-semibold">Error:</span>
                        Cannot show message because of error while processing
                    </p>
                {:else if isAnswering}
                    <div class="flex gap-2 items-center">
                        <span class="loading loading-spinner loading-sm"></span>
                        <span>Answering...</span>
                    </div>
                {:else if isStopped}
                    <div class="flex flex-col gap-2">
                        <div class="flex items-center gap-2 text-sm text-black/60 theme-dark:text-white/60">
                            <Icon icon="material-symbols:stop-circle-outline" width="18" height="18" />
                            <span class="font-semibold">Stopped</span>
                            <span class="opacity-70">Generation was stopped.</span>
                        </div>

                        <div class="mt-2" {@attach linkClickDelegation}>
                            <EditorContent 
                                editor={$answerEditor}
                            />
                        </div>
                    </div>
                {:else}
                    <div {@attach linkClickDelegation}>
                        <EditorContent 
                            editor={$answerEditor}
                        />
                    </div>
                {/if}
            </div>

            <!-- Proposals -->
            {#if !isError}
                <div
                    class="flex flex-col gap-5 mt-10"
                >
                    {#if documentManipulation}
                        {@render ManipulationTray("document")}
                    {/if}
        
                    {#if tasksListManipulation}
                        {@render ManipulationTray("tasks")}
                    {/if}
                </div>
            {/if}

            <!-- Information about mode, model and time -->
            <ModelModelAndTime
                {model}
                {aiChatMode}
                {time}
                {isAnswering}
            />
        {/if}
    </div>

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

    .bubble.error {
        border: 1px solid var(--color-error);
        border-radius: 0.5rem;
    }
</style>
