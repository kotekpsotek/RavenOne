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

<div class="answer-tiptap-content" contenteditable="false">
    <EditorContent editor={$answerEditor} class="prose prose-sm max-w-none" />
</div>
