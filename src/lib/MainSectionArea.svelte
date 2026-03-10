<script lang=ts>
    import { EditorContent } from "svelte-tiptap";
    import { editor } from "./stores/editor";
    import { selectedFile } from "./stores/files";
    import { isCurrentUserSelectedFileEditor } from "./stores/collaboration";
    import { workspaceHasActiveSubscription, workspaceSubscriptionCheckInProgress } from "./stores/subscription";
    import { isWorkspaceInAddition } from "./stores/workspace";
    import AddWorkspace from "./screens/AddWorkspace.svelte";
    import NoSelectedFile from "./screens/NoSelectedFile.svelte";
    import ListTray from "./ListTray.svelte";
    import { isSharedRoute } from "./stores/share";
    import "./Editor.css";

    let canEditWorkspaceContent = $derived(!$workspaceSubscriptionCheckInProgress && $workspaceHasActiveSubscription);
    let canEditSelectedFileContent = $derived(canEditWorkspaceContent && $isCurrentUserSelectedFileEditor);

    editor.update(ed => {
        if (ed) {
            ed.setEditable(canEditSelectedFileContent);
        }

        return ed;
    })
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
                {#if !canEditWorkspaceContent && !$workspaceSubscriptionCheckInProgress && !$isSharedRoute}
                    <div class="mx-4 mt-3 alert alert-warning text-sm">
                        This workspace has no active subscription. File content and points are read-only.
                    </div>
                {:else if !$isCurrentUserSelectedFileEditor && !$isSharedRoute}
                    <div class="mx-4 mt-3 alert alert-warning text-sm">
                        You are not a file editor collaborator for this file. File content and points are read-only.
                    </div>
                {/if}

                <EditorContent editor={$editor} class="tiptap-editor" />
                <ListTray isReadOnly={!canEditSelectedFileContent}/>
            </div>
        {/if}
    {:else}
        <NoSelectedFile/>
    {/if}
</div>
