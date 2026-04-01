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

const SELECTED_WORKSPACE_ID_STORAGE_KEY = "selected_workspace_id";
const LEGACY_SELECTED_WORKSPACE_STORAGE_KEY = "selected_workspace";

let hasDownloadedWorkspaces = false;
let workspaceSyncPromise: Promise<void> | null = null;
let storedSelectedWorkspaceId: string | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const normalized = value.trim();
    return normalized.length ? normalized : undefined;
}

function readSelectedWorkspaceIdFromStorage(): string | undefined {
    if (!browser) {
        return undefined;
    }

    const storedId = asNonEmptyString(localStorage.getItem(SELECTED_WORKSPACE_ID_STORAGE_KEY));
    if (storedId) {
        return storedId;
    }

    const legacyStoredWorkspace = localStorage.getItem(LEGACY_SELECTED_WORKSPACE_STORAGE_KEY);
    if (!legacyStoredWorkspace) {
        return undefined;
    }

    try {
        const parsedLegacyWorkspace = JSON.parse(legacyStoredWorkspace) as { id?: unknown };
        const legacyWorkspaceId = asNonEmptyString(parsedLegacyWorkspace?.id);

        if (legacyWorkspaceId) {
            localStorage.setItem(SELECTED_WORKSPACE_ID_STORAGE_KEY, legacyWorkspaceId);
        }

        localStorage.removeItem(LEGACY_SELECTED_WORKSPACE_STORAGE_KEY);
        return legacyWorkspaceId;
    } catch {
        const legacyWorkspaceId = asNonEmptyString(legacyStoredWorkspace);
        if (legacyWorkspaceId) {
            localStorage.setItem(SELECTED_WORKSPACE_ID_STORAGE_KEY, legacyWorkspaceId);
        }

        localStorage.removeItem(LEGACY_SELECTED_WORKSPACE_STORAGE_KEY);
        return legacyWorkspaceId;
    }
}

function persistSelectedWorkspaceId(selectedWorkspaceId: string | undefined): void {
    if (!browser) {
        return;
    }

    if (selectedWorkspaceId) {
        localStorage.setItem(SELECTED_WORKSPACE_ID_STORAGE_KEY, selectedWorkspaceId);
    } else {
        localStorage.removeItem(SELECTED_WORKSPACE_ID_STORAGE_KEY);
    }

    // Always clear legacy key to keep persistence format stable.
    localStorage.removeItem(LEGACY_SELECTED_WORKSPACE_STORAGE_KEY);
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

function syncSelectedWorkspace(workspaces: WorkspaceEntry[]) {
    if (!workspaces.length) {
        selectedWorkspace.set(undefined);
        return;
    }

    const currentSelectedWorkspace = get(selectedWorkspace);
    const preferredWorkspaceId = currentSelectedWorkspace?.id ?? storedSelectedWorkspaceId;

    if (preferredWorkspaceId) {
        const refreshedSelectedWorkspace = workspaces.find(workspace => workspace.id === preferredWorkspaceId);
        if (refreshedSelectedWorkspace) {
            selectedWorkspace.set(refreshedSelectedWorkspace);
            return;
        }
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
    console.log('Download workspaces', responseBody)
    
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

            avaiableWorkspaces.set(downloadedWorkspaces);
            syncSelectedWorkspace(downloadedWorkspaces);
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
    const { subscribe, set, update } = writable<WorkspaceEntry | undefined>(undefined);

    return {
        subscribe,
        set: (value: WorkspaceEntry | undefined) => {
            storedSelectedWorkspaceId = value?.id;
            persistSelectedWorkspaceId(storedSelectedWorkspaceId);
            set(value);
        },
        update: (updater: (currentWorkspace: WorkspaceEntry | undefined) => WorkspaceEntry | undefined) => {
            update(currentWorkspace => {
                const nextWorkspace = updater(currentWorkspace);
                storedSelectedWorkspaceId = nextWorkspace?.id;
                persistSelectedWorkspaceId(storedSelectedWorkspaceId);
                return nextWorkspace;
            });
        }
    };
})();
export const avaiableWorkspaces = writable<Workspace.Workspace.WorkspaceUserEntryLoaded[]>([]);
export const isWorkspaceSelectionOpen = writable<boolean>(false);
export const isWorkspaceInAddition = writable<boolean>(false);
export const isWorkspaceDownloadInProgress = writable<boolean>(false);

if (browser) {
    storedSelectedWorkspaceId = readSelectedWorkspaceIdFromStorage();
    isWorkspaceSelectionOpen.subscribe(onWorkspaceSelectionStateChange);

    // Resolve selected workspace from fresh backend payload instead of stale localStorage object snapshots.
    void syncWorkspaces({
        showLoading: true
    });
}

/**
 * Checks whether user can add another workspace to workspaces list
*/
export function isAddNewWorkspaceBtnDisabled(): ComponentProps<UI.Workspace.WorkspaceTray>["newWorkspaceButtonDisabled"] {
    const userState = get(user);

    // TODO: Make the real check base on stores we've -> user has to have the subscription to do it

    return false;
}
