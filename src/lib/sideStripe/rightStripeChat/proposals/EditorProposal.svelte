<script lang="ts">
    import { createEditor, Editor, EditorContent } from "svelte-tiptap";
    import { fileChatEditionPreviewShowing } from "$lib/stores/aiRightSideChat";
    import { createEditorExtensions } from "$lib/stores/editor";
    import Icon from "@iconify/svelte";
    import { callAcceptDocumentManipulation, callDeclineDocumentManipulation } from "./utilFunctions";
    import { isCurrentUserSelectedFileEditor } from "$lib/stores/collaboration";

    /* TODO: Show in future the differences as:
        - red markers - for the deleted elements
        - green markers - for the added elements
        - gray markers - fot the changed elements
    */

    const oldContentEditor = createEditor({
        content: $fileChatEditionPreviewShowing?.outputMessage.documentManipulation?.oldDocumentContentHTML ?? "Content isn't available",
        editable: false,
        extensions: createEditorExtensions()
    });
    const newContentEditor = createEditor({
        content: $fileChatEditionPreviewShowing?.outputMessage.documentManipulation?.newDocumentContentHTML ?? "Content isn't available",
        editable: false,
        extensions: createEditorExtensions()
    });

    function onClose() {
        fileChatEditionPreviewShowing.unsetPreviewing();
    }
</script>

{#snippet ShowEditorContent(type: "old" | "new", editor: Editor)}
    <div class="w-1/2">
        <div 
            class="upper-stripe flex justify-between"
        >
            <span class="text-lg name capitalize font-bold text-gray-600">
                {type}
            </span>
            {#if type === "new"}
                <div class="decision-tray flex gap-2">
                    <button
                        class="btn btn-sm btn-outline btn-success"
                        title="Accept new document proposition"
                        disabled={!$isCurrentUserSelectedFileEditor}
                        onclick={callAcceptDocumentManipulation($fileChatEditionPreviewShowing?.outputMessage!)}
                    >
                        Accept
                    </button>
                    <button
                        class="btn btn-sm btn-outline btn-error"
                        title="Decline new document proposition"
                        disabled={!$isCurrentUserSelectedFileEditor}
                        onclick={callDeclineDocumentManipulation($fileChatEditionPreviewShowing?.outputMessage!)}
                    >
                        Decline
                    </button>
                </div>
            {/if}
        </div>
        <EditorContent {editor} class="tiptap-editor tiptap-editor-{type}-content" />
    </div>
{/snippet}

<div class="h-full flex flex-col gap-4">
    <button
        class="btn btn-nutral w-fit flex items-center gap-1.5"
        onclick={onClose}
    >
        <Icon 
            icon="material-symbols:close-rounded"
        />
    
        <span>
            Close
        </span>
    </button>

    <div class="flex gap-2 h-full overflow-y-auto">
        {@render ShowEditorContent("old", $oldContentEditor)}
        <span class="border-r h-full w-2 border-gray-500 mx-2"></span>
        {@render ShowEditorContent("new", $newContentEditor)}
    </div>
</div>
