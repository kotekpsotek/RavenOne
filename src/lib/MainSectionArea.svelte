<script lang=ts>
    import { EditorContent } from "svelte-tiptap";
    import { editor } from "./stores/editor";
    import { selectedFile } from "./stores/files";
    import { workspaceHasActiveSubscription, workspaceSubscriptionCheckInProgress } from "./stores/subscription";
    import { isWorkspaceInAddition } from "./stores/workspace";
    import AddWorkspace from "./screens/AddWorkspace.svelte";
    import NoSelectedFile from "./screens/NoSelectedFile.svelte";
    import ListTray from "./ListTray.svelte";
    import "./Editor.css";
    import { isSharedRoute } from "./stores/share";
    import { isPointsStripeOpen } from "./stores/selectedSideStripes";

    let canEditWorkspaceContent = $derived(!$workspaceSubscriptionCheckInProgress && $workspaceHasActiveSubscription);

    editor.subscribe(ed => {
        if (ed) {
            ed.setEditable(canEditWorkspaceContent);
        }
    })
</script>


<div class="relative w-full h-full h-full overflow-hidden">
    <!-- Workspace Addition -->
    <AddWorkspace 
        bind:open={$isWorkspaceInAddition}
    />

    <!-- Editor -->
    {#if $selectedFile}
        {#if $editor}
            <div class="editor-container">
                {#if !canEditWorkspaceContent && !$workspaceSubscriptionCheckInProgress && !$isSharedRoute}
                    <div class="mx-4 mt-3 alert alert-warning text-sm">
                        This workspace has no active subscription. File content and points are read-only.
                    </div>
                {/if}

                <EditorContent editor={$editor} class="tiptap-editor" />

                {#if $isPointsStripeOpen}
                    <ListTray isReadOnly={!canEditWorkspaceContent}/>
                {/if}
            </div>
        {/if}
    {:else}
        <NoSelectedFile/>
    {/if}
</div>
