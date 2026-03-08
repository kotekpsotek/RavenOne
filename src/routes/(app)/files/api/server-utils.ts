import { randomUUID } from "node:crypto";
import { getAuthenticatedPayload } from "$lib/server/auth/request";
import { prefetchWorkspaceWithMembers } from "$lib/server/db";
import { DB_Models } from "@ravenlens/backend";
import { File } from "@ravenlens/shared";
import { json } from "@sveltejs/kit";
import type { Cookies } from "@sveltejs/kit";

export type FileEntry = File.File.File;
export type MovePosition = "before" | "after" | "inside";

const EMPTY_FILE_CONTENT = "<p></p>";

type RequireWorkspaceAccessArgs = {
    request: Request;
    cookies: Cookies;
    fetchFn: typeof fetch;
    workspaceId: string;
    requireManageFiles?: boolean;
};

function buildForwardedAuthHeaders(request: Request): Headers {
    const forwardedHeaders = new Headers();
    const authorization = request.headers.get("authorization");
    const cookieHeader = request.headers.get("cookie");

    if (authorization) {
        forwardedHeaders.set("authorization", authorization);
    }

    if (cookieHeader) {
        forwardedHeaders.set("cookie", cookieHeader);
    }

    return forwardedHeaders;
}

async function ensureAuthenticatedViaRoute(request: Request, fetchFn: typeof fetch): Promise<Response | null> {
    try {
        const response = await fetchFn("/auth/is-authenticated", {
            method: "GET",
            headers: buildForwardedAuthHeaders(request)
        });

        return response;
    } catch {
        return null;
    }
}

export function asNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
}

export function asNullableString(value: unknown): string | null | undefined {
    if (value === null) {
        return null;
    }

    return asNonEmptyString(value);
}

function normalizeFileContent(contentCandidate: unknown): string {
    if (typeof contentCandidate !== "string") {
        return EMPTY_FILE_CONTENT;
    }

    if (!contentCandidate.trim()) {
        return EMPTY_FILE_CONTENT;
    }

    return contentCandidate;
}

export async function parseJsonBody<T>(request: Request): Promise<T | null> {
    try {
        return (await request.json()) as T;
    } catch {
        return null;
    }
}

export async function requireWorkspaceAccess(args: RequireWorkspaceAccessArgs): Promise<{ userId: string } | Response> {
    const authStatusResponse = await ensureAuthenticatedViaRoute(args.request, args.fetchFn);
    if (!authStatusResponse) {
        return json({ ok: false, message: "Failed to validate authentication" }, { status: 500 });
    }

    if (!authStatusResponse.ok) {
        return json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const payload = getAuthenticatedPayload(args.request, args.cookies);
    if (!payload) {
        return json({ ok: false, message: "Invalid or expired token" }, { status: 401 });
    }

    const workspace = await prefetchWorkspaceWithMembers(args.workspaceId);
    if (!workspace) {
        return json({ ok: false, message: "Workspace not found" }, { status: 404 });
    }

    const workspaceMembers = Array.isArray(workspace.workspaceMembers) ? workspace.workspaceMembers : [];
    const workspaceMember = workspaceMembers.find((member) => member.user.id === payload.userId);

    const isOwner = workspace.ownerUserId === payload.userId;
    if (!isOwner && !workspaceMember) {
        return json({ ok: false, message: "Only workspace members can manage files" }, { status: 403 });
    }

    if (args.requireManageFiles) {
        const canManageFiles = isOwner || Boolean(workspaceMember?.permissions.includes("manage_files"));
        if (!canManageFiles) {
            return json({ ok: false, message: "You do not have manage_files permission" }, { status: 403 });
        }
    }

    return {
        userId: payload.userId
    };
}

function toDate(value: unknown): Date {
    if (value instanceof Date) {
        return value;
    }

    if (typeof value === "string" || typeof value === "number") {
        const converted = new Date(value);
        if (!Number.isNaN(converted.getTime())) {
            return converted;
        }
    }

    return new Date();
}

function normalizeSubentries(subentries: unknown, workspaceId: string): FileEntry[] | undefined {
    if (!Array.isArray(subentries) || !subentries.length) {
        return undefined;
    }

    return subentries.map((entry) => sanitizeEntry(entry as FileEntry, workspaceId));
}

export function sanitizeEntry(entry: FileEntry, workspaceId: string): FileEntry {
    const normalizedIcon = asNonEmptyString(entry.icon);
    const normalizedWalper = asNonEmptyString(entry.walper);
    const normalizedSubentries = normalizeSubentries(entry.subentries, workspaceId);

    return {
        type: "file",
        id: String(entry.id),
        name: String(entry.name),
        createdAt: toDate(entry.createdAt),
        lists: Array.isArray(entry.lists) ? entry.lists : [],
        content: normalizeFileContent(entry.content),
        // Keep entries grouped per workspace in the current schema shape.
        createdByAuthorId: workspaceId,
        ...(normalizedIcon ? { icon: normalizedIcon } : {}),
        ...(normalizedWalper ? { walper: normalizedWalper } : {}),
        ...(normalizedSubentries?.length ? { subentries: normalizedSubentries } : {})
    };
}

export async function loadWorkspaceEntries(workspaceId: string): Promise<FileEntry[]> {
    const entries = await DB_Models.File.fileModel
        .find({ createdByAuthorId: workspaceId })
        .lean<FileEntry[]>();

    if (!Array.isArray(entries)) {
        return [];
    }

    return entries.map((entry) => sanitizeEntry(entry, workspaceId));
}

export async function persistWorkspaceEntries(workspaceId: string, entries: FileEntry[]): Promise<void> {
    const normalizedEntries = entries.map((entry) => sanitizeEntry(entry, workspaceId));

    await DB_Models.File.fileModel.deleteMany({ createdByAuthorId: workspaceId });
    if (!normalizedEntries.length) {
        return;
    }

    await DB_Models.File.fileModel.insertMany(normalizedEntries);
}

export function createFileEntry(name: string, workspaceId: string): FileEntry {
    return {
        type: "file",
        id: randomUUID(),
        name,
        lists: [],
        createdAt: new Date(),
        content: EMPTY_FILE_CONTENT,
        createdByAuthorId: workspaceId
    };
}

export function findFileById(items: FileEntry[], fileId: string): FileEntry | null {
    for (const item of items) {
        if (item.id === fileId) {
            return item;
        }

        if (item.subentries?.length) {
            const nested = findFileById(item.subentries, fileId);
            if (nested) {
                return nested;
            }
        }
    }

    return null;
}

export function updateFileById(
    items: FileEntry[],
    fileId: string,
    updater: (item: FileEntry) => FileEntry
): { updated: boolean; entries: FileEntry[] } {
    let wasUpdated = false;

    const entries = items.map((item) => {
        if (item.id === fileId) {
            wasUpdated = true;
            return updater(item);
        }

        if (item.subentries?.length) {
            const updatedNested = updateFileById(item.subentries, fileId, updater);
            if (!updatedNested.updated) {
                return item;
            }

            wasUpdated = true;
            return {
                ...item,
                subentries: updatedNested.entries
            };
        }

        return item;
    });

    return {
        updated: wasUpdated,
        entries
    };
}

export function removeFileById(items: FileEntry[], fileId: string): { removed: boolean; entries: FileEntry[] } {
    let wasRemoved = false;

    const entries = items
        .filter((item) => {
            const keep = item.id !== fileId;
            if (!keep) {
                wasRemoved = true;
            }

            return keep;
        })
        .map((item) => {
            if (!item.subentries?.length) {
                return item;
            }

            const updatedNested = removeFileById(item.subentries, fileId);
            if (updatedNested.removed) {
                wasRemoved = true;
            }

            return {
                ...item,
                subentries: updatedNested.entries
            };
        });

    return {
        removed: wasRemoved,
        entries
    };
}

export function addFileToTarget(
    items: FileEntry[],
    targetId: string,
    newFile: FileEntry
): { inserted: boolean; entries: FileEntry[] } {
    let inserted = false;

    const entries = items.map((item) => {
        if (item.id === targetId) {
            inserted = true;
            return {
                ...item,
                subentries: [...(item.subentries ?? []), newFile]
            };
        }

        if (item.subentries?.length) {
            const nested = addFileToTarget(item.subentries, targetId, newFile);
            if (!nested.inserted) {
                return item;
            }

            inserted = true;
            return {
                ...item,
                subentries: nested.entries
            };
        }

        return item;
    });

    return {
        inserted,
        entries
    };
}

function hasNestedEntry(item: FileEntry | null, searchId: string): boolean {
    if (!item?.subentries?.length) {
        return false;
    }

    for (const subentry of item.subentries) {
        if (subentry.id === searchId || hasNestedEntry(subentry, searchId)) {
            return true;
        }
    }

    return false;
}

export function moveFileEntry(
    entries: FileEntry[],
    sourceId: string,
    targetId: string | null,
    position: MovePosition
): { moved: boolean; entries: FileEntry[] } {
    if (sourceId === targetId) {
        return {
            moved: false,
            entries
        };
    }

    if (targetId !== null) {
        const sourceEntry = findFileById(entries, sourceId);
        if (sourceEntry && hasNestedEntry(sourceEntry, targetId)) {
            return {
                moved: false,
                entries
            };
        }
    }

    let draggedItem: FileEntry | null = null;

    function findAndRemove(items: FileEntry[]): FileEntry[] {
        const index = items.findIndex((item) => item.id === sourceId);
        if (index !== -1) {
            draggedItem = items[index];
            return items.filter((_, itemIndex) => itemIndex !== index);
        }

        return items.map((item) => {
            if (item.subentries?.length) {
                return {
                    ...item,
                    subentries: findAndRemove(item.subentries)
                };
            }

            return item;
        });
    }

    let inserted = false;

    function findAndInsert(items: FileEntry[], itemToInsert: FileEntry): FileEntry[] {
        if (targetId === null) {
            inserted = true;
            return [...items, itemToInsert];
        }

        const index = items.findIndex((item) => item.id === targetId);
        if (index !== -1) {
            inserted = true;
            const updatedItems = [...items];
            if (position === "before") {
                updatedItems.splice(index, 0, itemToInsert);
            } else if (position === "after") {
                updatedItems.splice(index + 1, 0, itemToInsert);
            } else {
                const target = items[index];
                updatedItems[index] = {
                    ...target,
                    subentries: [...(target.subentries ?? []), itemToInsert]
                };
            }

            return updatedItems;
        }

        return items.map((item) => {
            if (item.subentries?.length) {
                return {
                    ...item,
                    subentries: findAndInsert(item.subentries, itemToInsert)
                };
            }

            return item;
        });
    }

    const entriesWithoutSource = findAndRemove(entries);
    if (!draggedItem) {
        return {
            moved: false,
            entries
        };
    }

    const insertedEntries = findAndInsert(entriesWithoutSource, draggedItem);
    if (!inserted) {
        return {
            moved: false,
            entries
        };
    }

    return {
        moved: true,
        entries: insertedEntries
    };
}
