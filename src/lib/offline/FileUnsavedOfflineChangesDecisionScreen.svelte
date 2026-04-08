<script lang="ts">
    import { onMount } from "svelte";
    import { createEditor, Editor, EditorContent } from "svelte-tiptap";
    import Icon from "@iconify/svelte";
    import { createEditorExtensions } from "$lib/stores/editor";
    import { onlineOfflineContentHandler } from "$lib/offline/offline";

    const fileDecisionStore = onlineOfflineContentHandler.fileDecisionStore;
    const editorExtensionsPromise = createEditorExtensions();
    type PreviewEditor = ReturnType<typeof createEditor>;

    const previewState = $derived({
        freshestContent: $fileDecisionStore?.theFreshestFile.content ?? "<p>Content isn't available</p>",
        offlineContent: $fileDecisionStore?.fileSaved.content ?? "<p>Content isn't available</p>",
    });

    let freshestEditorStore = $state<PreviewEditor>();
    let offlineEditorStore = $state<PreviewEditor>();
    let freshestEditorInstance = $state<Editor>();
    let offlineEditorInstance = $state<Editor>();
    let lastAppliedFreshestContent = "";
    let lastAppliedOfflineContent = "";
    let isOperationPending = $state(false);

    onMount(() => {
        let cancelled = false;
        let createdFreshestEditor: PreviewEditor | undefined;
        let createdOfflineEditor: PreviewEditor | undefined;
        let unsubscribeFreshestEditor: (() => void) | undefined;
        let unsubscribeOfflineEditor: (() => void) | undefined;

        editorExtensionsPromise.then((extensions) => {
            if (cancelled) {
                return;
            }

            createdFreshestEditor = createEditor({
                content: "<p></p>",
                editable: false,
                extensions
            });

            createdOfflineEditor = createEditor({
                content: "<p></p>",
                editable: false,
                extensions
            });

            unsubscribeFreshestEditor = createdFreshestEditor.subscribe((editorInstance) => {
                if (editorInstance) {
                    freshestEditorInstance = editorInstance;
                }
            });

            unsubscribeOfflineEditor = createdOfflineEditor.subscribe((editorInstance) => {
                if (editorInstance) {
                    offlineEditorInstance = editorInstance;
                }
            });

            freshestEditorStore = createdFreshestEditor;
            offlineEditorStore = createdOfflineEditor;
        });

        return () => {
            cancelled = true;
            unsubscribeFreshestEditor?.();
            unsubscribeOfflineEditor?.();
            freshestEditorInstance?.destroy();
            offlineEditorInstance?.destroy();
        };
    });

    $effect(() => {
        const editor = freshestEditorInstance;
        if (!editor) {
            return;
        }

        const nextContent = previewState.freshestContent;
        if (lastAppliedFreshestContent === nextContent) {
            return;
        }

        lastAppliedFreshestContent = nextContent;
        editor.commands.setContent(nextContent, { emitUpdate: false });
    });

    $effect(() => {
        const editor = offlineEditorInstance;
        if (!editor) {
            return;
        }

        const nextContent = previewState.offlineContent;
        if (lastAppliedOfflineContent === nextContent) {
            return;
        }

        lastAppliedOfflineContent = nextContent;
        editor.commands.setContent(nextContent, { emitUpdate: false });
    });

    async function onAccept() {
        if (isOperationPending) {
            return;
        }

        isOperationPending = true;
        try {
            await fileDecisionStore.accept();
        } finally {
            isOperationPending = false;
        }
    }

    async function onDelete() {
        if (isOperationPending) {
            return;
        }

        isOperationPending = true;
        try {
            await fileDecisionStore.decline();
        } finally {
            isOperationPending = false;
        }
    }

    function onClose() {
        fileDecisionStore.close();
    }
</script>

{#snippet ShowEditorContent(type: "freshest" | "offline", editor: Editor)}
    <div class="w-1/2">
        <div class="upper-stripe flex justify-between">
            <span class="text-lg name capitalize font-bold text-gray-600">
                {type === "freshest" ? "Freshest" : "Offline Changes"}
            </span>

            {#if type === "offline"}
                <div class="decision-tray flex gap-2">
                    <button
                        class="btn btn-sm btn-outline btn-success"
                        title="Keep offline unsaved changes"
                        disabled={isOperationPending}
                        onclick={onAccept}
                    >
                        Accept
                    </button>

                    <button
                        class="btn btn-sm btn-outline btn-error"
                        title="Delete offline unsaved changes and keep freshest file"
                        disabled={isOperationPending}
                        onclick={onDelete}
                    >
                        Delete
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
        disabled={isOperationPending}
        onclick={onClose}
    >
        <Icon icon="material-symbols:close-rounded" />
        <span>Close</span>
    </button>

    <div class="flex gap-2 h-full overflow-y-auto">
        {#if freshestEditorStore && freshestEditorInstance}
            {@render ShowEditorContent("freshest", freshestEditorInstance)}
        {/if}

        <span class="border-r h-full w-2 border-gray-500 mx-2"></span>

        {#if offlineEditorStore && offlineEditorInstance}
            {@render ShowEditorContent("offline", offlineEditorInstance)}
        {/if}
    </div>
</div>