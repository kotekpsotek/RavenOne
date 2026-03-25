<script lang="ts">
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
    import { isCurrentUserSelectedFileEditor } from "$lib/stores/collaboration";
    import { activeChat, fileChatEditionPreviewShowing } from "$lib/stores/aiRightSideChat";
    import { callAcceptDocumentManipulation, callAcceptTasksManipulation, callDeclineDocumentManipulation, callDeclineTasksManipulation } from "../proposals/utilFunctions";
    import { isPointsStripeOpen } from "$lib/stores/selectedSideStripes";

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

    // Defined whetther the preview of changes is showing for the selected element
    let isDocumentManipulationShowing = $state(false);
    let isTasksManipulationShowing = $state(false);

    /** Answer Editor */
    const answerEditor = $derived(createEditor({
        content: messageContentHTML,
        editable: false,
        extensions: [StarterKit]
    }));

    const getReasoningPresentation = (reason: ReasoningPhases) => {
        if (reason.phase === "thinking") {
            const thoughts = reason.thoughts instanceof Array ? reason.thoughts : [reason.thoughts];
            return {
                icon: "material-symbols:psychology-outline",
                name: "Thinking",
                description: `
                    <ol style="list-style-type: decimal !important; list-style-position: inside !important; padding-left: 0.5rem !important; margin-top: 0.5rem !important; display: block !important;">
                        ${thoughts.map(thought => `<li style="display: list-item !important; margin-bottom: 0.25rem !important; opacity: 0.8;">${thought}</li>`).join("")}
                    </ol>
                `
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
            description: reason.todo.map(todoPoint => `${todoPoint.event}: ${todoPoint.content}`).join("<br/>")
        };
    };

    function onToggleDocumentManipulation() {
        if (!isDocumentManipulationShowing) {
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

    // Manege the previewing of changes
    $effect(() => {
        const preview = $fileChatEditionPreviewShowing;
        const isThisMessage = preview?.chatId === $activeChat.id && preview?.outputMessage.id === message.id;

        isDocumentManipulationShowing = isThisMessage && preview?.type === "document-manipulation";
        isTasksManipulationShowing = isThisMessage && preview?.type === "tasks-manipulation";
    });
</script>

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
            {#if reasoning.length && !isError}
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
                            <Timeline style="padding: 0;">
                                {#each reasoning as reason, index (index)}
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
                                                {@html meta.description}
                                            </div>
                                        </TimelineContent>
                                    </TimelineItem>
                                {/each}
                            </Timeline>
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
                {:else}
                    <EditorContent 
                        editor={$answerEditor}
                    />
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
</div>

<style>
    @reference "../../../../app.css";

    .bubble.stoped {
        @apply border border-dashed border-error;
    }

    .bubble.error {
        @apply border border-error rounded-lg;
    }
</style>
