<script lang="ts">
    import type { File } from "$lib/sharedCompat";
    import { callAcceptTasksManipulation, callDeclineTasksManipulation } from "./utilFunctions";
    import { fileChatEditionPreviewShowing } from "$lib/stores/aiRightSideChat";
    import { selectedFile } from "$lib/stores/files";
    import { getList } from "./SpawnedListProposal.util";
    import type { Readable } from "svelte/store";
    import ListTray from "$lib/ListTray.svelte";
    import Icon from "@iconify/svelte";
    import { isUserDecisionPermitted } from "./permission";

    let {
        canEditWorkspaceContent
    }: {
        canEditWorkspaceContent: Readable<boolean>
    } = $props();

    // TODO: Send preview proposed list to backend
    const previewProposedLists = $derived(getList($fileChatEditionPreviewShowing?.outputMessage.tasksListManipulation));

    function onClose() {
        fileChatEditionPreviewShowing.unsetPreviewing();
    }
</script>

<!-- TODO: Show list tray content  -->

{#snippet ShowListContent(type: "old" | "new", lists: File.File.SpawnedList[])}
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
                        onclick={callAcceptTasksManipulation($fileChatEditionPreviewShowing?.outputMessage!, previewProposedLists)}
                    >
                        Accept
                    </button>
                    <button
                        class="btn btn-sm btn-outline btn-error"
                        title="Decline new document proposition"
                        disabled={!$isUserDecisionPermitted}
                        onclick={callDeclineTasksManipulation($fileChatEditionPreviewShowing?.outputMessage!)}
                    >
                        Decline
                    </button>
                </div>
            {/if}
        </div>
        
        <ListTray
            {lists}
            isReadOnly={true}
        />
    </div>
{/snippet}

<div class="h-fit flex flex-col gap-4 overflow-hidden">
    <div class="header">
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
    </div>

    <div class="flex gap-2 h-fit overflow-y-auto">
        <div class="flex gap-2 w-full h-fit">
            {@render ShowListContent("old", $selectedFile?.lists ?? [])}
            <span class="border-r h-fit w-2 border-gray-500 mx-2"></span>
            {@render ShowListContent("new", previewProposedLists)}
        </div>
    </div>
</div>
