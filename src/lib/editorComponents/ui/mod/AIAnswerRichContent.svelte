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

    $effect(() => {
        const editor = $answerEditor;
        if (!editor) {
            return;
        }

        editor.setEditable(false, false);
        editor.commands.setContent(normalizeContent(content), { emitUpdate: false });
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
