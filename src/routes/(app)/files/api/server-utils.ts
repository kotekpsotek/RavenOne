import { randomUUID } from "node:crypto";
import { extractBearerToken, getAuthenticatedPayload } from "$lib/server/auth/request";
import { prefetchWorkspaceWithMembers } from "$lib/server/db";
import { getWorkspaceActiveSubscription } from "$lib/server/subscription";
import { DB_Models } from "@ravenlens/backend";
import { Collabortation, File } from "@ravenlens/shared";
import { env } from "$env/dynamic/public";
import { json } from "@sveltejs/kit";
import type { Cookies } from "@sveltejs/kit";
import { fileCollaborators } from "$lib/stores/collaboration";

export type FileEntry = File.File.File;
export type MovePosition = "before" | "after" | "inside";

export type WorkspaceAccess = {
    userId: string;
    authToken: string;
    collabProfile: ConstructorParameters<typeof Collabortation.Collab>[1];
};

const EMPTY_FILE_CONTENT = "<p></p>";

type RequireWorkspaceAccessArgs = {
    request: Request;
    cookies: Cookies;
    fetchFn: typeof fetch;
    workspaceId: string;
    requireManageFiles?: boolean;
    requireActiveWorkspaceSubscription?: boolean;
    activeWorkspaceSubscriptionFailureMessage?: string;
};

/**
 * @param options 
 * @returns undefined - when user has access to file or Response when user hasn't got access
 */
export async function hasUserEditorFileAccess(
    options: {
        request: Request;
        cookies: Cookies;
        file: FileEntry;
        workspaceId: string;
    }
) {
    const payload = getAuthenticatedPayload(options.request, options.cookies);
    if (!payload) {
        return json({ message: "JWT Payload isn't specified", ok: false }, { status: 400 });
    }
    
    const hasEditorGradeAccess = await Collabortation.amIEditorOfFile(options.file, {
        connectionURL: `${env.PUBLIC_SOCKET_IO_COLLABORATION_SERVICE_URL}/am-i-editor-of-file`,
        userId: payload.userId,
        workspaceId: options.workspaceId
    });
    if (!hasEditorGradeAccess) {
        return json({ message: "You've no access to save file: " + options.file.name, ok: false }, { status: 400 });
    }

    return undefined
}

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

function toCollabProfile(
    profileCandidate: unknown,
    fallbackUserId: string
): ConstructorParameters<typeof Collabortation.Collab>[1] {
    if (!profileCandidate || typeof profileCandidate !== "object") {
        return {
            id: fallbackUserId,
            name: "Unknown collaborator",
            profileImgURL: undefined,
            mainAccountType: "email",
            createdAt: new Date()
        };
    }

    const profile = profileCandidate as {
        id?: unknown;
        name?: unknown;
        profileImgURL?: unknown;
        mainAccountType?: unknown;
        createdAt?: unknown;
    };

    const mainAccountTypeCandidate = profile.mainAccountType;
    const mainAccountType = mainAccountTypeCandidate === "email"
        || mainAccountTypeCandidate === "github"
        || mainAccountTypeCandidate === "google"
        || mainAccountTypeCandidate === "linkedin"
        ? mainAccountTypeCandidate
        : "email";

    return {
        id: asNonEmptyString(profile.id) ?? fallbackUserId,
        name: asNonEmptyString(profile.name) ?? "Unknown collaborator",
        profileImgURL: asNonEmptyString(profile.profileImgURL),
        mainAccountType,
        createdAt: toDate(profile.createdAt)
    };
}

export function createFileCollaboration(access: WorkspaceAccess): Collabortation.Collab | Response {
    const collaborationServiceUrl = asNonEmptyString(env.PUBLIC_SOCKET_IO_COLLABORATION_SERVICE_URL);
    if (!collaborationServiceUrl) {
        return json(
            {
                ok: false,
                message: "Cannot verify file editor collaborator because collaboration service URL is not configured"
            },
            { status: 500 }
        );
    }

    return new Collabortation.Collab(
        access.authToken,
        access.collabProfile,
        collaborationServiceUrl
    );
}

export async function requireWorkspaceAccess(args: RequireWorkspaceAccessArgs): Promise<WorkspaceAccess | Response> {
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

    const authToken = extractBearerToken(args.request, args.cookies);
    if (!authToken) {
        return json({ ok: false, message: "Invalid or expired token" }, { status: 401 });
    }

    const workspace = await prefetchWorkspaceWithMembers(args.workspaceId);
    if (!workspace) {
        return json({ ok: false, message: "Workspace not found" }, { status: 404 });
    }

    const workspaceMembers = Array.isArray(workspace.workspaceMembers) ? workspace.workspaceMembers : [];
    const workspaceMember = workspaceMembers.find((member) => member.user.id === payload.userId);
    const ownerWorkspaceMember = workspaceMembers.find((member) => member.user.id === workspace.ownerUserId);

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

    if (args.requireActiveWorkspaceSubscription) {
        const workspaceSubscription = await getWorkspaceActiveSubscription(args.workspaceId);
        if (!workspaceSubscription.workspaceFound) {
            return json({ ok: false, message: "Workspace not found" }, { status: 404 });
        }

        if (!workspaceSubscription.hasActiveSubscription) {
            return json(
                {
                    ok: false,
                    message: args.activeWorkspaceSubscriptionFailureMessage
                        ?? "This workspace has no active subscription for this operation"
                },
                { status: 401 }
            );
        }
    }

    return {
        userId: payload.userId,
        authToken,
        collabProfile: toCollabProfile(
            workspaceMember?.user ?? (isOwner ? ownerWorkspaceMember?.user : undefined),
            payload.userId
        )
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

function normalizeSharedUrls(sharedUrls: unknown): NonNullable<FileEntry["sharedURLs"]> | undefined {
    if (!Array.isArray(sharedUrls) || !sharedUrls.length) {
        return undefined;
    }

    const normalizedSharedUrls = sharedUrls
        .filter((entry): entry is NonNullable<FileEntry["sharedURLs"]>[number] => {
            return Boolean(
                entry
                && typeof entry === "object"
                && "url" in entry
                && "sharedByUserId" in entry
            );
        })
        .map((entry) => {
            const sharedAt = toDate(entry.sharedAt);

            return {
                url: String(entry.url),
                sharedAt,
                sharedByUserId: String(entry.sharedByUserId)
            };
        })
        .filter((entry) => entry.url.trim().length && entry.sharedByUserId.trim().length);

    return normalizedSharedUrls.length ? normalizedSharedUrls : undefined;
}

export function sanitizeEntry(entry: FileEntry, workspaceId: string): FileEntry {
    const normalizedIcon = asNonEmptyString(entry.icon);
    const normalizedWalper = asNonEmptyString(entry.walper);
    const normalizedSubentries = normalizeSubentries(entry.subentries, workspaceId);
    const normalizedSharedUrls = normalizeSharedUrls(entry.sharedURLs);

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
        ...(normalizedSubentries?.length ? { subentries: normalizedSubentries } : {}),
        ...(normalizedSharedUrls?.length ? { sharedURLs: normalizedSharedUrls } : {})
    };
}

function collectNestedEntryIds(items: FileEntry[], bucket: Set<string> = new Set<string>()): Set<string> {
    for (const item of items) {
        if (!item.subentries?.length) {
            continue;
        }

        for (const subentry of item.subentries) {
            bucket.add(String(subentry.id));
        }

        collectNestedEntryIds(item.subentries, bucket);
    }

    return bucket;
}

function dedupeEntryTree(entries: FileEntry[]): FileEntry[] {
    const seenIds = new Set<string>();
    const nestedEntryIds = collectNestedEntryIds(entries);

    const walk = (items: FileEntry[], isRootLevel: boolean): FileEntry[] => {
        const dedupedEntries: FileEntry[] = [];

        for (const item of items) {
            const entryId = String(item.id);

            // If the same id exists as nested entry, drop duplicated root copy.
            if (isRootLevel && nestedEntryIds.has(entryId)) {
                continue;
            }

            if (seenIds.has(entryId)) {
                continue;
            }

            seenIds.add(entryId);

            const dedupedSubentries = item.subentries?.length
                ? walk(item.subentries, false)
                : undefined;

            dedupedEntries.push({
                ...item,
                ...(dedupedSubentries?.length ? { subentries: dedupedSubentries } : {})
            });
        }

        return dedupedEntries;
    };

    return walk(entries, true);
}

export async function loadWorkspaceEntries(workspaceId: string): Promise<FileEntry[]> {
    const entries = await DB_Models.File.fileModel
        .find({ createdByAuthorId: workspaceId })
        .lean<FileEntry[]>();

    if (!Array.isArray(entries)) {
        return [];
    }

    return dedupeEntryTree(entries.map((entry) => sanitizeEntry(entry, workspaceId)));
}

export async function persistWorkspaceEntries(workspaceId: string, entries: FileEntry[]): Promise<void> {
    const normalizedEntries = entries.map((entry) => sanitizeEntry(entry, workspaceId));
    const dedupedEntries = dedupeEntryTree(normalizedEntries);

    await DB_Models.File.fileModel.deleteMany({ createdByAuthorId: workspaceId });
    if (!dedupedEntries.length) {
        return;
    }

    await DB_Models.File.fileModel.insertMany(dedupedEntries);
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
