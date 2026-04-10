<script lang=ts>
    import { onDestroy } from "svelte";
    import { derived } from "svelte/store";
    import { EditorContent } from "svelte-tiptap";
    import { editor } from "./stores/editor";
    import { isFileDownloading, isFileSaving, selectedFile } from "./stores/files";
    import { isCurrentUserSelectedFileEditor } from "./stores/collaboration";
    import { workspaceHasActiveSubscription, workspaceSubscriptionCheckInProgress } from "./stores/subscription";
    import { isWorkspaceInAddition } from "./stores/workspace";
    import AddWorkspace from "./screens/AddWorkspace.svelte";
    import NoSelectedFile from "./screens/NoSelectedFile.svelte";
    import ListTray from "./ListTray.svelte";
    // import BubbleMenuRavenOne from "./components/BubbleMenuRavenOne.svelte";
    import { isSharedRoute } from "./stores/share";
    import "./Editor.css";

    const canEditWorkspaceContent = derived(
        [workspaceSubscriptionCheckInProgress, workspaceHasActiveSubscription],
        ([$workspaceSubscriptionCheckInProgress, $workspaceHasActiveSubscription]) => {
            return !$workspaceSubscriptionCheckInProgress && $workspaceHasActiveSubscription;
        }
    );

    const canEditSelectedFileContent = derived(
        [selectedFile, canEditWorkspaceContent, isCurrentUserSelectedFileEditor],
        ([$selectedFile, $canEditWorkspaceContent, $isCurrentUserSelectedFileEditor]) => {
            return Boolean($selectedFile && $canEditWorkspaceContent && $isCurrentUserSelectedFileEditor);
        }
    );

    const unsubscribeEditabilitySync = derived(
        [editor, canEditSelectedFileContent],
        ([$editor, $canEditSelectedFileContent]) => ({
            activeEditor: $editor,
            canEdit: $canEditSelectedFileContent
        })
    ).subscribe(({ activeEditor, canEdit }) => {
        if (!activeEditor || activeEditor.isEditable === canEdit) {
            return;
        }

        activeEditor.setEditable(canEdit);
    });

    onDestroy(() => {
        unsubscribeEditabilitySync();
    });
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
                {#if !$canEditWorkspaceContent && !$workspaceSubscriptionCheckInProgress && !$isSharedRoute}
                    <div class="mx-4 mt-3 alert alert-warning text-sm">
                        This workspace has no active subscription. File content and points are read-only.
                    </div>
                {/if}

                {#if $isFileDownloading || ($isFileSaving && $isFileSaving !== "without-scardfolding")}
                    <div class="w-full h-full flex flex-col gap-2">
                        <div class="skeleton h-4 w-28"></div>
                        <div class="skeleton h-4 w-[200px]"></div>
                        <div class="skeleton h-4 w-full"></div>
                        <div class="skeleton h-4 w-full"></div>
                        <div class="skeleton h-4 w-[400px]"></div>
                        <div class="skeleton h-4 w-1/2"></div>
                        <div class="skeleton h-4 w-full"></div>
                        <div class="skeleton h-4 w-[200px]"></div>
                        <div class="skeleton h-4 w-[150px]"></div>
                    </div>
                {:else}
                    <EditorContent editor={$editor} class="tiptap-editor" />
                    <ListTray isReadOnly={!$canEditSelectedFileContent}/>
                {/if}
            </div>
        {/if}
    {:else}
        <NoSelectedFile/>
    {/if}
</div>
