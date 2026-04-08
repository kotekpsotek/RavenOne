<script lang="ts">
    import { onMount } from "svelte";
    import { createEditor, Editor, EditorContent } from "svelte-tiptap";
    import { fileChatEditionPreviewShowing } from "$lib/stores/aiRightSideChat";
    import { createEditorExtensions } from "$lib/stores/editor";
    import Icon from "@iconify/svelte";
    import { callAcceptDocumentManipulation, callDeclineDocumentManipulation } from "./utilFunctions";
    import { isUserDecisionPermitted } from "./permission";

    /* TODO: Show in future the differences as:
        - red markers - for the deleted elements
        - green markers - for the added elements
        - gray markers - fot the changed elements
    */
   $effect(() => console.log($fileChatEditionPreviewShowing?.outputMessage))

    const editorExtensionsPromise = createEditorExtensions();
    type PreviewEditor = ReturnType<typeof createEditor>;

    const previewState = $derived({
        oldContent:
            $fileChatEditionPreviewShowing?.outputMessage.documentManipulation?.oldDocumentContentHTML ??
            "<p>Content isn't available</p>",
        newContent:
            $fileChatEditionPreviewShowing?.outputMessage.documentManipulation?.newDocumentContentHTML ??
            "<p>Content isn't available</p>",
    });

    let oldContentEditorStore = $state<PreviewEditor>();
    let newContentEditorStore = $state<PreviewEditor>();
    let oldContentEditorInstance = $state<Editor>();
    let newContentEditorInstance = $state<Editor>();
    let lastAppliedOldContent = "";
    let lastAppliedNewContent = "";

    onMount(() => {
        let cancelled = false;
        let createdOldEditor: PreviewEditor | undefined;
        let createdNewEditor: PreviewEditor | undefined;
        let unsubscribeOldEditor: (() => void) | undefined;
        let unsubscribeNewEditor: (() => void) | undefined;

        editorExtensionsPromise.then((extensions) => {
            if (cancelled) {
                return;
            }

            createdOldEditor = createEditor({
                content: "<p></p>",
                editable: false,
                extensions
            });
            createdNewEditor = createEditor({
                content: "<p></p>",
                editable: false,
                extensions
            });

            unsubscribeOldEditor = createdOldEditor.subscribe((editorInstance) => {
                if (editorInstance) {
                    oldContentEditorInstance = editorInstance;
                }
            });

            unsubscribeNewEditor = createdNewEditor.subscribe((editorInstance) => {
                if (editorInstance) {
                    newContentEditorInstance = editorInstance;
                }
            });

            oldContentEditorStore = createdOldEditor;
            newContentEditorStore = createdNewEditor;
        });

        return () => {
            cancelled = true;
            unsubscribeOldEditor?.();
            unsubscribeNewEditor?.();
            oldContentEditorInstance?.destroy();
            newContentEditorInstance?.destroy();
        };
    });

    $effect(() => {
        const editor = oldContentEditorInstance;
        if (!editor) {
            return;
        }

        const nextContent = previewState.oldContent;
        if (lastAppliedOldContent === nextContent) {
            return;
        }

        lastAppliedOldContent = nextContent;
        editor.commands.setContent(nextContent, { emitUpdate: false });
    });

    $effect(() => {
        const editor = newContentEditorInstance;
        if (!editor) {
            return;
        }

        const nextContent = previewState.newContent;
        if (lastAppliedNewContent === nextContent) {
            return;
        }

        lastAppliedNewContent = nextContent;
        editor.commands.setContent(nextContent, { emitUpdate: false });
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
                        disabled={!$isUserDecisionPermitted}
                        onclick={callAcceptDocumentManipulation($fileChatEditionPreviewShowing?.outputMessage!)}
                    >
                        Accept
                    </button>
                    <button
                        class="btn btn-sm btn-outline btn-error"
                        title="Decline new document proposition"
                        disabled={!$isUserDecisionPermitted}
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
        {#if oldContentEditorStore && oldContentEditorInstance}
            {@render ShowEditorContent("old", oldContentEditorInstance)}
        {/if}

        <span class="border-r h-full w-2 border-gray-500 mx-2"></span>

        {#if newContentEditorStore && newContentEditorInstance}
            {@render ShowEditorContent("new", newContentEditorInstance)}
        {/if}
    </div>
</div>
