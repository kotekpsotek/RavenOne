<script lang="ts">
    import { editorAIChat } from "$lib/stores/aiRightSideChat";
    import Icon from "@iconify/svelte";
    import { createEditor, EditorContent } from "svelte-tiptap";
    import StarterKit from "@tiptap/starter-kit";
    import type { MessageOutput } from "@ravenlens/shared/chat-ai/backend/schema";
    import type { ProviderID } from "../../../../../../../packages/shared/dist/ai";

    const {
        message = $bindable()
    }: { message: MessageOutput } = $props();
    const { 
        id,
        model,
        isStopped,
        messageContentHTML,
        documentManipulation,
        tasksListManipulation,
        reasoning,
    } = $derived(message);
</script>

<div
    class="bubble-wrapper flex justify-end items-center"
>
    <div
        class="bubble"
        class:stoped={isStopped}
        data-message-id={id}
    >

    </div>
</div>
