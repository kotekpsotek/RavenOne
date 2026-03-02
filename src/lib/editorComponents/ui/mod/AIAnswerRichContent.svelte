<script lang="ts">
    import { onDestroy } from "svelte";
    import { createEditor, EditorContent } from "svelte-tiptap";
    import { StarterKit } from "@tiptap/starter-kit";

    let { content }: { content: string } = $props();

    function normalizeContent(value?: string) {
        if (!value || !value.trim()) {
            return "<p></p>";
        }

        return value;
    }

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

        const nextContent = normalizeContent(content);

        if (lastAppliedContent === nextContent) {
            return;
        }

        lastAppliedContent = nextContent;
        editor.commands.setContent(nextContent, { emitUpdate: false });
    });

    onDestroy(() => {
        const editor = $answerEditor;
        if (editor) {
            editor.destroy();
        }
    });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="answer-tiptap-content select-text"
    onclick={(ev) => ev.stopPropagation()}
    onmousedown={(ev) => ev.stopPropagation()}
>
    <EditorContent editor={$answerEditor} class="prose prose-sm max-w-none" />
</div>

<style>
    .answer-tiptap-content,
    .answer-tiptap-content :global(.ProseMirror) {
        user-select: text;
        -webkit-user-select: text;
        cursor: text;
    }
</style>
