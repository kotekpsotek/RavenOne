import { selectedFile } from "$lib/stores/files";
import { get } from "svelte/store";
import type { MessageOutput } from "@ravenlens/shared/chat-ai/backend/schema";
import type { SpawnedList } from "../../../../../../../packages/shared/dist/types/file/file";

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
 * Compose a proposal preview list by combining the current file lists with the
 * AI task list manipulation payload.
 */
export function getList(tasksListManipulation?: MessageOutput["tasksListManipulation"]): SpawnedList[] {
	const selectedFileLists = (get(selectedFile)?.lists ?? []).map(cloneList);
	if (!tasksListManipulation) {
		return selectedFileLists;
	}

	const { orderedLists, listsById } = buildListsById([
		...selectedFileLists,
		...(tasksListManipulation.newLists ?? []).map(cloneList)
	]);

	let withNewLists = applyAddedTasksToLists(
		orderedLists,
		listsById,
		tasksListManipulation.addedTasksToLists?.map(addition => ({
			taskListId: addition.taskListId,
			tasksListItems: [...addition.tasksListItems]
		}))
	);

	withNewLists = withNewLists.map(list => {
		const edits = tasksListManipulation.editedTasks?.filter(e => e.taskListId === list.id) ?? [];
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

		const removals = tasksListManipulation.removedTasks?.filter(r => r.taskListId === list.id) ?? [];
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
