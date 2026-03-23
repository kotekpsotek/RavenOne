<script lang=ts>
    import { editorAIChat } from "$lib/stores/aiRightSideChat";
    import Icon from "@iconify/svelte";
    import type { AIChatMode } from "@ravenlens/backend";
    import type { AI } from "@ravenlens/shared"
    import type { AIChatModel, MessageUserPrompt } from "@ravenlens/shared/chat-ai/backend/schema";
    import { getTime } from "./utils";

    const {
        aiChatMode,
        model,
        time,
        isAnswering
    }: {
        aiChatMode: AIChatMode;
        model: AIChatModel;
        time: MessageUserPrompt["time"];
        isAnswering?: boolean;
    } = $props();

    let currentTime = $state(Date.now());

    $effect(() => {
        if (!isAnswering) {
            return;
        }

        const interval = setInterval(() => {
            currentTime = Date.now();
        }, 10);

        return () => clearInterval(interval);
    });

    const computedTime = $derived.by(() => {
        if (isAnswering && time?.startAt) {
            const startTime = new Date(time.startAt).getTime();
            const elapsed = currentTime - startTime;
            return getTime({ startAt: time.startAt, endAt: new Date(startTime + elapsed) });
        }

        return getTime(time);
    });

    /** Gets the Icon */
    function getProviderIcon(provider: AI.ProviderID) {
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
        <span 
            class="font-semibold"
            title="Response Time: {computedTime}"
        >
            {computedTime}
        </span>
    </div>
</div>