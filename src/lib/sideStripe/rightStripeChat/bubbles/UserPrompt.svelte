<script lang="ts">
    import Icon from "@iconify/svelte";
    import { createEditor, EditorContent } from "svelte-tiptap";
    import StarterKit from "@tiptap/starter-kit";
    import type { MessageUserPrompt } from "@ravenlens/shared/chat-ai/backend/schema";
    import ModelModelAndTime from "./ModelModelAndTime.svelte";

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
        time
        
    } = $derived(message);

    /** Answer Editor */
    const answerEditor = $derived(createEditor({
        content: messageContentHTML,
        editable: false,
        extensions: [StarterKit]
    }));
</script>

<div
    class="bubble-wrapper flex justify-end items-center"
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
        />
    </div>

    {#if context}
        <div class="context-info"></div>
    {/if}
</div>

<style>
    @reference "../../../../app.css";

    .bubble.stoped {
        @apply border border-dashed border-error;
    }
</style>
