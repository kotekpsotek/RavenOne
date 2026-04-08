<script lang=ts>
    import { onDestroy, onMount } from "svelte";
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
    import { isSharedRoute } from "./stores/share";
    import { isPointsStripeOpen } from "./stores/selectedSideStripes";
    import { fileChatEditionPreviewShowing } from "./stores/aiRightSideChat";
    import EditorProposal from "./sideStripe/rightStripeChat/proposals/EditorProposal.svelte";
    import LoadingScreen from "./components/LoadingScreen.svelte";
    import ListTrayProposal from "./sideStripe/rightStripeChat/proposals/ListTrayProposal.svelte";
    import FileUnsavedOfflineChangesDecisionScreen from "./offline/FileUnsavedOfflineChangesDecisionScreen.svelte";
    import { onlineOfflineContentHandler } from "./offline/offline";
    import { setAlert } from "./utils/alert";
    import "./Editor.css";

    const fileDecisionStore = onlineOfflineContentHandler.fileDecisionStore;

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

    onMount(() => {
        window.addEventListener("keydown", async (ev) => {
            
            if (ev.ctrlKey && ev.key === "s" && $selectedFile) {
                ev.preventDefault();

                const result = await selectedFile.requestSave($selectedFile);

                if (!result) {
                    setAlert("error", "Cannot Save File", "Cannot save file content");
                }
            }
        })
    })
    
    onDestroy(() => {
        unsubscribeEditabilitySync();
    });
</script>


<div class="relative w-full h-full h-full overflow-hidden">
    <!-- Workspace Addition -->
    <AddWorkspace 
        bind:open={$isWorkspaceInAddition}
    />

    <!-- Shows loading screen as needed -->
    <LoadingScreen/>

    <!-- Editor -->
    {#if $selectedFile}
        {#if $editor}
            <div class="editor-container">
                {#if !$canEditWorkspaceContent && !$workspaceSubscriptionCheckInProgress && !$isSharedRoute}
                    <div class="mx-4 mt-3 alert alert-warning text-sm">
                        This workspace has no active subscription. File content and points are read-only.
                    </div>
                {/if}

                {#if $isFileDownloading || $isFileSaving}
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
                    {#if $fileChatEditionPreviewShowing?.type === "document-manipulation"}
                        <EditorProposal/>
                    {:else if $fileDecisionStore?.isOpen}
                        <FileUnsavedOfflineChangesDecisionScreen />
                    {:else} <!-- Show for tasks proposal or when proposal isn't specified -->
                        <EditorContent editor={$editor} class="tiptap-editor" />
                    {/if}
                    
                    {#if $isPointsStripeOpen && !$fileDecisionStore?.isOpen}
                        {#if $fileChatEditionPreviewShowing?.type === "tasks-manipulation"}
                            <ListTrayProposal
                                {canEditWorkspaceContent}
                            />
                        {:else}
                            <ListTray
                                isReadOnly={!canEditWorkspaceContent}
                                lists={$selectedFile.lists ?? []}
                            />
                        {/if}
                    {/if}
                {/if}
            </div>
        {/if}
    {:else}
        <NoSelectedFile/>
    {/if}
</div>
