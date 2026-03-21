<script lang="ts">
    import { editorAIChat } from "$lib/stores/aiRightSideChat";
    import Icon from "@iconify/svelte";
    import { createEditor, EditorContent } from "svelte-tiptap";
    import StarterKit from "@tiptap/starter-kit";
    import type { MessageUserPrompt } from "@ravenlens/shared/chat-ai/backend/schema";
    import type { ProviderID } from "../../../../../../../packages/shared/dist/ai";
    import { getTime } from "./utils";

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

    /** Gets the Icon */
    function getProviderIcon(provider: ProviderID) {
        switch(provider) {
            case "Anthropic":
                return "simple-icons:claude";

            case "Google":
                return "simple-icons:googlegemini";
                
            case "OpenAI":
                return "simple-icons:openai";
                
            default:
                return ""
        }
    }
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

        <div
            class="below flex gap-3 items-center justify-between select-none text-xs"
        >
            <div class="left-side flex gap-3 items-center">
                <button class="flex gap-1 items-center justify-center">
                    <Icon
                        icon="material-symbols:shoppingmode-outline"
                    />
                
                    <span>
                        {editorAIChat.getTextFieldModeTranslation(aiChatMode)}
                    </span>
                </button>
    
                <button 
                    class="flex gap-1 items-center justify-center"
                    title="{model.provider} {model.model}"
                >
                    <Icon
                        icon={getProviderIcon(model.provider)}
                    />
                    
                    <span>
                        {model.model}
                    </span>
                </button>
            </div>

            <div class="right-side">
                <span class="font-semibold">{getTime(time)}</span>
            </div>
        </div>
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
