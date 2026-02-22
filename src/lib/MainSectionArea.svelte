<script>
    import { EditorContent } from "svelte-tiptap";
    import { editor } from "./stores/editor";
    import "./Editor.css";
</script>

{#if $editor}
    <div class="editor-container">
        <EditorContent editor={$editor} class="tiptap-editor" />
    </div>
{/if}
