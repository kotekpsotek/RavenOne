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

    const FALLBACK_TASK_LIST_NAME = "AI Task List";
    const FALLBACK_TASK_LIST_ICON = "material-symbols:checklist-rounded";

    function cloneList(list: SpawnedList): SpawnedList {
        return {
            ...list,
            items: [...list.items]
        };
    }

    function normalizeListId(listIdCandidate: unknown): string {
        return typeof listIdCandidate === "string" ? listIdCandidate.trim() : "";
    }

    function createEmptyLookup<T>(): Record<string, T> {
        return Object.create(null) as Record<string, T>;
    }

    function createUniqueListId(preferredId: string, usedIds: Record<string, true>): string {
        const normalizedPreferredId = normalizeListId(preferredId);
        if (normalizedPreferredId && !usedIds[normalizedPreferredId]) {
            usedIds[normalizedPreferredId] = true;
            return normalizedPreferredId;
        }

        const fallbackBaseId = normalizedPreferredId || "ai-task-list";
        let nextId = fallbackBaseId;
        let suffix = 1;

        while (usedIds[nextId]) {
            nextId = `${fallbackBaseId}-${suffix}`;
            suffix += 1;
        }

        usedIds[nextId] = true;
        return nextId;
    }

    function createFallbackTaskList(taskListId: string, items: SpawnedList["items"], usedIds: Record<string, true>): SpawnedList {
        return {
            id: createUniqueListId(taskListId, usedIds),
            kind: "task",
            name: FALLBACK_TASK_LIST_NAME,
            icon: FALLBACK_TASK_LIST_ICON,
            items: [...items]
        };
    }

    function createUsedIdLookup(lists: SpawnedList[]): Record<string, true> {
        const usedIds = createEmptyLookup<true>();

        for (const list of lists) {
            const normalizedListId = normalizeListId(list.id);
            if (normalizedListId) {
                usedIds[normalizedListId] = true;
            }
        }

        return usedIds;
    }

    function buildListsById(lists: SpawnedList[]): {
        orderedLists: SpawnedList[];
        listsById: Record<string, SpawnedList>;
    } {
        const orderedLists: SpawnedList[] = [];
        const listsById = createEmptyLookup<SpawnedList>();
        const usedIds = createEmptyLookup<true>();

        for (const list of lists.map(cloneList)) {
            const normalizedListId = normalizeListId(list.id);
            if (normalizedListId && listsById[normalizedListId]) {
                const existingList = listsById[normalizedListId];
                existingList.items = [...existingList.items, ...list.items];
                continue;
            }

            const resolvedListId = normalizedListId || createUniqueListId(normalizedListId, usedIds);

            if (normalizedListId) {
                usedIds[normalizedListId] = true;
            }

            const nextList = {
                ...list,
                id: resolvedListId
            };

            listsById[resolvedListId] = nextList;
            orderedLists.push(nextList);
        }

        return {
            orderedLists,
            listsById
        };
    }

    function applyAddedTasksToLists(
        baseLists: SpawnedList[],
        listsById: Record<string, SpawnedList>,
        addedTasksToLists: Array<{ taskListId: string; tasksListItems: SpawnedList["items"] }> | undefined
    ): SpawnedList[] {
        if (!addedTasksToLists?.length) {
            return [...baseLists];
        }

        const nextLists = [...baseLists];
        const usedIds = createUsedIdLookup(baseLists);

        for (const addition of addedTasksToLists) {
            const normalizedListId = normalizeListId(addition.taskListId);
            const existingList = normalizedListId ? listsById[normalizedListId] : undefined;
            if (existingList) {
                existingList.items = [...existingList.items, ...addition.tasksListItems];
                continue;
            }

            const fallbackList = createFallbackTaskList(normalizedListId, addition.tasksListItems, usedIds);
            listsById[fallbackList.id] = fallbackList;
            nextLists.push(fallbackList);
        }

        return nextLists;
    }

    /**
     * Compose list base on current list by adding new lists and tasks to existsing list respectivelly:
     *  - editted - edit task
     *  - new - add new task
     *  - removed - remove tasks
     * @param previewState
     */
    function getList(previewState: typeof $fileChatEditionPreviewShowing): SpawnedList[] {
        const selectedFileLists = (get(selectedFile)?.lists ?? []).map(cloneList);
        const manpultaionTg = previewState?.outputMessage.tasksListManipulation;

        if (!manpultaionTg) return selectedFileLists;

        const { orderedLists, listsById } = buildListsById([
            ...selectedFileLists,
            ...(manpultaionTg.newLists ?? []).map(cloneList)
        ]);

        let withNewLists = applyAddedTasksToLists(
            orderedLists,
            listsById,
            manpultaionTg.addedTasksToLists?.map(addition => ({
                taskListId: addition.taskListId,
                tasksListItems: [...addition.tasksListItems]
            }))
        );

        // Apply task manipulations
        withNewLists = withNewLists.map(list => {
            // Edit existing items
            const edits = manpultaionTg.editedTasks?.filter(e => e.taskListId === list.id) ?? [];
            if (edits.length) {
                const editsByItemId = createEmptyLookup<SpawnedList["items"][number]>();

                for (const edit of edits) {
                    for (const item of edit.taskItems) {
                        editsByItemId[item.id] = item;
                    }
                }

                list.items = list.items.map(item => {
                    const editedItem = editsByItemId[item.id];
                    return editedItem ? { ...item, ...editedItem } : item;
                });
            }

            // Remove task items
            const removals = manpultaionTg.removedTasks?.filter(r => r.taskListId === list.id) ?? [];
            if (removals.length) {
                const removedTaskIds = createEmptyLookup<true>();

                for (const removal of removals) {
                    for (const taskItemId of removal.taskItemsIds) {
                        removedTaskIds[taskItemId] = true;
                    }
                }

                list.items = list.items.filter(item => !removedTaskIds[item.id]);
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
