<script lang=ts>
    import { EditorContent } from "svelte-tiptap";
    import { editor } from "./stores/editor";
    import { selectedFile } from "./stores/files";
    import { isWorkspaceInAddition } from "./stores/workspace";
    import AddWorkspace from "./screens/AddWorkspace.svelte";
    import NoSelectedFile from "./screens/NoSelectedFile.svelte";
    import ListTray from "./ListTray.svelte";
    import "./Editor.css";
</script>


<div class="relative w-full h-full min-h-0 overflow-hidden">
    <!-- Workspace Addition -->
    <AddWorkspace 
        bind:open={$isWorkspaceInAddition}
    />

    <!-- Editor -->
    {#if $selectedFile}
        {#if $editor}
            <div class="editor-container">
                <EditorContent editor={$editor} class="tiptap-editor" />
                <ListTray/>
            </div>
        {/if}
    {:else}
        <NoSelectedFile/>
    {/if}
</div>
