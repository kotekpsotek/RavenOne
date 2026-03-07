import { get, writable } from "svelte/store";
import { Workspace } from "@ravenlens/shared";
import { userProfile as user } from "./user";
import type { ComponentProps } from "svelte";
import type { UI } from "@ravenlens/frontend";
import { browser } from "$app/environment";
import { fetchAuthenticated } from "$lib/utils/fetch";

type WorkspaceEntry = Workspace.Workspace.WorkspaceUserEntryLoaded;

const WORKSPACE_COLLECTION_KEYS = [
    "avaiableWorkspaces",
    "availableWorkspaces",
    "workspaces",
    "workspaceEntries",
    "workspaceUserEntries",
    "workspaceUsersEntryLoaded",
    "workspaceUserEntryLoaded"
] as const;

let hasDownloadedWorkspaces = false;
let workspaceSyncPromise: Promise<void> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function toWorkspaceEntry(value: unknown): WorkspaceEntry | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = value.id;
    const name = value.name;
    if (typeof id !== "string" || typeof name !== "string") {
        return undefined;
    }

    return value as unknown as WorkspaceEntry;
}

function readWorkspaceArrayFrom(record: Record<string, unknown>): WorkspaceEntry[] | undefined {
    for (const key of WORKSPACE_COLLECTION_KEYS) {
        const candidate = record[key];
        if (!Array.isArray(candidate)) {
            continue;
        }

        const normalized = candidate
            .map(toWorkspaceEntry)
            .filter((workspace): workspace is WorkspaceEntry => Boolean(workspace));

        // Empty array is still a valid "downloaded" state.
        if (normalized.length || candidate.length === 0) {
            return normalized;
        }
    }

    return undefined;
}

function extractWorkspacesFromPayload(payload: unknown): WorkspaceEntry[] {
    const queue: unknown[] = [payload];
    const visited = new Set<unknown>();

    while (queue.length) {
        const candidate = queue.shift();
        if (!candidate || visited.has(candidate) || !isRecord(candidate)) {
            continue;
        }

        visited.add(candidate);

        const foundWorkspaces = readWorkspaceArrayFrom(candidate);
        if (foundWorkspaces !== undefined) {
            return foundWorkspaces;
        }

        for (const value of Object.values(candidate)) {
            if (isRecord(value)) {
                queue.push(value);
            } else if (Array.isArray(value)) {
                for (const arrayItem of value) {
                    if (isRecord(arrayItem)) {
                        queue.push(arrayItem);
                    }
                }
            }
        }
    }

    return [];
}

function mergeWorkspaces(existing: WorkspaceEntry[], incoming: WorkspaceEntry[]): WorkspaceEntry[] {
    const merged = [...existing];
    const indexById = new Map<string, number>();

    for (let index = 0; index < merged.length; index++) {
        indexById.set(merged[index].id, index);
    }

    for (const workspace of incoming) {
        const existingIndex = indexById.get(workspace.id);
        if (existingIndex === undefined) {
            indexById.set(workspace.id, merged.length);
            merged.push(workspace);
            continue;
        }

        // Keep existing order but refresh payload for already-known workspaces.
        merged[existingIndex] = workspace;
    }

    return merged;
}

function syncSelectedWorkspace(workspaces: WorkspaceEntry[]) {
    if (!workspaces.length) {
        return;
    }

    const currentSelectedWorkspace = get(selectedWorkspace);
    if (!currentSelectedWorkspace) {
        selectedWorkspace.set(workspaces[0]);
        return;
    }

    const refreshedSelectedWorkspace = workspaces.find(workspace => workspace.id === currentSelectedWorkspace.id);
    if (refreshedSelectedWorkspace) {
        selectedWorkspace.set(refreshedSelectedWorkspace);
        return;
    }

    selectedWorkspace.set(workspaces[0]);
}

async function downloadWorkspacesFromBackend(): Promise<WorkspaceEntry[]> {
    const backendCall = await fetchAuthenticated("/workspace/download", {
        method: "GET"
    });

    if (!backendCall.ok) {
        throw new Error(`Cannot download workspaces. /workspace/download returned ${backendCall.status}`);
    }

    const responseBody = await backendCall.json();
    return extractWorkspacesFromPayload(responseBody);
}

type WorkspaceSyncOptions = {
    showLoading: boolean;
};

async function syncWorkspaces(options: WorkspaceSyncOptions): Promise<void> {
    if (workspaceSyncPromise) {
        return workspaceSyncPromise;
    }

    workspaceSyncPromise = (async () => {
        if (options.showLoading) {
            isWorkspaceDownloadInProgress.set(true);
        }

        try {
            const downloadedWorkspaces = await downloadWorkspacesFromBackend();

            let mergedWorkspaces: WorkspaceEntry[] = [];
            avaiableWorkspaces.update(existingWorkspaces => {
                mergedWorkspaces = mergeWorkspaces(existingWorkspaces, downloadedWorkspaces);
                return mergedWorkspaces;
            });

            syncSelectedWorkspace(mergedWorkspaces);
            hasDownloadedWorkspaces = true;
        } catch (error) {
            console.error("Failed to synchronize available workspaces", error);
        } finally {
            if (options.showLoading) {
                isWorkspaceDownloadInProgress.set(false);
            }

            workspaceSyncPromise = null;
        }
    })();

    return workspaceSyncPromise;
}

function onWorkspaceSelectionStateChange(isOpen: boolean) {
    if (!isOpen) {
        return;
    }

    const hasCachedWorkspaces = hasDownloadedWorkspaces || get(avaiableWorkspaces).length > 0;
    void syncWorkspaces({
        // First open with no cache blocks tray to show explicit loading state.
        showLoading: !hasCachedWorkspaces
    });
}

export const selectedWorkspace = (() => {
    const STORAGE_KEY = 'selected_workspace';
    const { subscribe, set, update } = writable<Workspace.Workspace.WorkspaceUserEntryLoaded | undefined>(undefined);

    // Load from localStorage if in browser
    if (browser) {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                set(JSON.parse(stored));
            } catch (e) {
                console.error("Failed to parse selected workspace from localStorage", e);
            }
        }
    }

    return {
        subscribe,
        set: (value: Workspace.Workspace.WorkspaceUserEntryLoaded | undefined) => {
            if (browser) {
                if (value) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
                } else {
                    localStorage.removeItem(STORAGE_KEY);
                }
            }
            set(value);
        },
        update
    };
})();
export const avaiableWorkspaces = writable<Workspace.Workspace.WorkspaceUserEntryLoaded[]>([]);
export const isWorkspaceSelectionOpen = writable<boolean>(false);
export const isWorkspaceInAddition = writable<boolean>(false);
export const isWorkspaceDownloadInProgress = writable<boolean>(false);

if (browser) {
    isWorkspaceSelectionOpen.subscribe(onWorkspaceSelectionStateChange);
}

/**
 * Checks whether user can add another workspace to workspaces list
*/
export function isAddNewWorkspaceBtnDisabled(): ComponentProps<UI.Workspace.WorkspaceTray>["newWorkspaceButtonDisabled"] {
    const userState = get(user);

    // TODO: Make the real check base on stores we've -> user has to have the subscription to do it

    return false;
}
