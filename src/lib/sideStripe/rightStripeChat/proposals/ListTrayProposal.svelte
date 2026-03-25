<script lang="ts">
    import type { SpawnedList } from "../../../../../../../packages/shared/dist/types/file/file";
    import { callAcceptTasksManipulation, callDeclineTasksManipulation } from "./utilFunctions";
    import { fileChatEditionPreviewShowing } from "$lib/stores/aiRightSideChat";
    import { selectedFile } from "$lib/stores/files";
    import { get, type Readable } from "svelte/store";
    import ListTray from "$lib/ListTray.svelte";
    import Icon from "@iconify/svelte";
    import { isCurrentUserSelectedFileEditor } from "$lib/stores/collaboration";

    let {
        canEditWorkspaceContent
    }: {
        canEditWorkspaceContent: Readable<boolean>
    } = $props();

    /**
     * Compose list base on current list by adding new lists and tasks to existsing list respectivelly:
     *  - editted - edit task
     *  - new - add new task
     *  - removed - remove tasks
     * @param previewState
     */
    function getList(previewState: typeof $fileChatEditionPreviewShowing): SpawnedList[] {
        const selectedFileLists = (get(selectedFile)?.lists ?? []).map(l => ({ ...l, items: [...l.items] }));
        const manpultaionTg = previewState?.outputMessage.tasksListManipulation;

        if (!manpultaionTg) return selectedFileLists;

        let withNewLists = [
            ...selectedFileLists,
            ...(manpultaionTg.newLists ?? []).map(l => ({ ...l, items: [...l.items] }))
        ];

        // Apply task manipulations
        withNewLists = withNewLists.map(list => {
            // Add new task items
            const addition = manpultaionTg.addedTasksToLists?.find(a => a.taskListId === list.id);
            if (addition) {
                list.items = [...list.items, ...addition.tasksListItems];
            }

            // Edit existing items
            const edits = manpultaionTg.editedTasks?.find(e => e.taskListId === list.id);
            if (edits) {
                list.items = list.items.map(item => {
                    const editedItem = edits.taskItems.find(ei => ei.id === item.id);
                    return editedItem ? { ...item, ...editedItem } : item;
                });
            }

            // Remove task items
            const removal = manpultaionTg.removedTasks?.find(r => r.taskListId === list.id);
            if (removal) {
                list.items = list.items.filter(item => !removal.taskItemsIds.includes(item.id));
            }

            return list;
        });

        return withNewLists;
    }
    const previewProposedLists = $derived(getList($fileChatEditionPreviewShowing));

    function onClose() {
        fileChatEditionPreviewShowing.unsetPreviewing();
    }
</script>

<!-- TODO: Show list tray content  -->

{#snippet ShowListContent(type: "old" | "new", lists: SpawnedList[])}
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
                        onclick={callAcceptTasksManipulation($fileChatEditionPreviewShowing?.outputMessage!)}
                    >
                        Accept
                    </button>
                    <button
                        class="btn btn-sm btn-outline btn-error"
                        title="Decline new document proposition"
                        disabled={!$isCurrentUserSelectedFileEditor}
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
