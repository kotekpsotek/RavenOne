import { env } from "$env/dynamic/private";
import { prefetchWorkspaceWithMembers } from "$lib/server/db";
import {
	asNonEmptyString,
	findFileById,
	loadWorkspaceEntries,
	parseJsonBody,
	persistWorkspaceEntries,
	requireWorkspaceAccess,
	updateFileById
} from "../server-utils";
import { File, Workspace } from "@ravenlens/shared";
import { randomUUID } from "node:crypto";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

type CreateShareRequestBody = {
	workspaceId?: unknown;
	fileId?: unknown;
};

type ShareUrlParts = {
	workspaceId: string;
	fileId: string;
	shareId: string;
};

type SharedUrlEntry = NonNullable<File.File.File["sharedURLs"]>[number];

function resolveSharedBaseUrl(): URL | null {
	const configuredOrigin = asNonEmptyString(env.SHARED_FILE_PUBLIC_ORIGIN);
	if (!configuredOrigin) {
		return null;
	}

	try {
		const baseUrl = new URL(configuredOrigin);
		baseUrl.pathname = "/";
		baseUrl.search = "";
		baseUrl.hash = "";
		return baseUrl;
	} catch {
		return null;
	}
}

function decodePathSegment(value: string): string | null {
	try {
		const decoded = decodeURIComponent(value);
		const normalized = decoded.trim();
		return normalized.length ? normalized : null;
	} catch {
		return null;
	}
}

function buildSharePath(workspaceId: string, fileId: string, shareId: string): string {
	return `/share/${encodeURIComponent(workspaceId)}/${encodeURIComponent(fileId)}/${encodeURIComponent(shareId)}`;
}

function buildShareUrl(baseUrl: URL, workspaceId: string, fileId: string, shareId: string): string {
	return new URL(buildSharePath(workspaceId, fileId, shareId), baseUrl).toString();
}

function parseShareUrl(candidateUrl: string): ShareUrlParts | null {
	let parsedUrl: URL;

	try {
		parsedUrl = new URL(candidateUrl);
	} catch {
		return null;
	}

	const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
	if (pathSegments.length !== 4 || pathSegments[0] !== "share") {
		return null;
	}

	const workspaceId = decodePathSegment(pathSegments[1]);
	const fileId = decodePathSegment(pathSegments[2]);
	const shareId = decodePathSegment(pathSegments[3]);

	if (!workspaceId || !fileId || !shareId) {
		return null;
	}

	return {
		workspaceId,
		fileId,
		shareId
	};
}

function normalizeSharedUrlEntries(sharedURLs: File.File.File["sharedURLs"]): SharedUrlEntry[] {
	if (!Array.isArray(sharedURLs)) {
		return [];
	}

	return sharedURLs
		.filter((entry): entry is SharedUrlEntry => {
			return Boolean(entry?.url && entry?.sharedByUserId);
		})
		.map((entry) => {
			const sharedAt = entry.sharedAt instanceof Date
				? entry.sharedAt
				: new Date(entry.sharedAt ?? Date.now());

			return {
				url: entry.url,
				sharedAt,
				sharedByUserId: entry.sharedByUserId
			};
		});
}

function toWorkspaceEntry(
	workspaceId: string,
	workspace: Awaited<ReturnType<typeof prefetchWorkspaceWithMembers>>,
	userId: string
): Workspace.Workspace.WorkspaceUserEntryLoaded | null {
	if (!workspace) {
		return null;
	}

	const workspaceMembers = Array.isArray(workspace.workspaceMembers) ? workspace.workspaceMembers : [];
	const workspaceMember = workspaceMembers.find((member) => member.user.id === userId);
	const isOwner = workspace.ownerUserId === userId;

	if (!isOwner && !workspaceMember) {
		return null;
	}

	return {
		id: typeof workspace.id === "string" ? workspace.id : workspaceId,
		name: typeof workspace.name === "string" ? workspace.name : "Workspace",
		imageUrl: typeof workspace.imageUrl === "string" ? workspace.imageUrl : "",
		ownerUserId: typeof workspace.ownerUserId === "string" ? workspace.ownerUserId : "",
		isOwner,
		userPermissions: isOwner
			? []
			: Array.isArray(workspaceMember?.permissions)
				? workspaceMember.permissions
				: []
	};
}

export const POST: RequestHandler = async ({ request, cookies, fetch }) => {
	const requestBody = await parseJsonBody<CreateShareRequestBody>(request);
	if (!requestBody) {
		return json({ ok: false, message: "Invalid request body" }, { status: 400 });
	}

	const workspaceId = asNonEmptyString(requestBody.workspaceId);
	const fileId = asNonEmptyString(requestBody.fileId);

	if (!workspaceId || !fileId) {
		return json({ ok: false, message: "workspaceId and fileId are required" }, { status: 400 });
	}

	const access = await requireWorkspaceAccess({
		request,
		cookies,
		fetchFn: fetch,
		workspaceId
	});

	if (access instanceof Response) {
		return access;
	}

	const sharedBaseUrl = resolveSharedBaseUrl();
	if (!sharedBaseUrl) {
		return json({ ok: false, message: "SHARED_FILE_PUBLIC_ORIGIN is invalid" }, { status: 500 });
	}

	const workspaceEntries = await loadWorkspaceEntries(workspaceId);
	const fileEntry = findFileById(workspaceEntries, fileId);

	if (!fileEntry) {
		return json({ ok: false, message: "File was not found" }, { status: 404 });
	}

	const shareId = randomUUID().replaceAll("-", "");
	const shareUrl = buildShareUrl(sharedBaseUrl, workspaceId, fileId, shareId);
	const sharedAt = new Date();

	const updateResult = updateFileById(workspaceEntries, fileId, (entry) => {
		const existingSharedUrls = normalizeSharedUrlEntries(entry.sharedURLs);

		return {
			...entry,
			sharedURLs: [
				...existingSharedUrls,
				{
					url: shareUrl,
					sharedAt,
					sharedByUserId: access.userId
				}
			]
		};
	});

	if (!updateResult.updated) {
		return json({ ok: false, message: "File was not found" }, { status: 404 });
	}

	await persistWorkspaceEntries(workspaceId, updateResult.entries);

	return json(
		{
			ok: true,
			workspaceId,
			fileId,
			shareId,
			shareUrl,
			sharedAt
		},
		{ status: 200 }
	);
};

export const GET: RequestHandler = async ({ request, cookies, fetch, url }) => {
	const workspaceId = asNonEmptyString(url.searchParams.get("workspaceId"));
	const fileId = asNonEmptyString(url.searchParams.get("fileId"));
	const shareId = asNonEmptyString(url.searchParams.get("shareId"));

	if (!workspaceId || !fileId || !shareId) {
		return json(
			{ ok: false, message: "workspaceId, fileId and shareId are required" },
			{ status: 400 }
		);
	}

	const access = await requireWorkspaceAccess({
		request,
		cookies,
		fetchFn: fetch,
		workspaceId
	});

	if (access instanceof Response) {
		return access;
	}

	const workspaceEntries = await loadWorkspaceEntries(workspaceId);
	const fileEntry = findFileById(workspaceEntries, fileId);

	if (!fileEntry) {
		return json({ ok: false, message: "File was not found" }, { status: 404 });
	}

	const sharedUrls = normalizeSharedUrlEntries(fileEntry.sharedURLs);
	const sharedUrl = sharedUrls.find((entry) => {
		const parsedShareUrl = parseShareUrl(entry.url);
		if (!parsedShareUrl) {
			return false;
		}

		return parsedShareUrl.workspaceId === workspaceId
			&& parsedShareUrl.fileId === fileId
			&& parsedShareUrl.shareId === shareId;
	});

	if (!sharedUrl) {
		return json({ ok: false, message: "Shared file link was not found" }, { status: 404 });
	}

	const workspace = await prefetchWorkspaceWithMembers(workspaceId);
	const workspaceEntry = toWorkspaceEntry(workspaceId, workspace, access.userId);

	if (!workspaceEntry) {
		return json({ ok: false, message: "Workspace access denied" }, { status: 403 });
	}

	return json(
		{
			ok: true,
			workspace: workspaceEntry,
			file: fileEntry,
			shareUrl: sharedUrl.url,
			sharedAt: sharedUrl.sharedAt
		},
		{ status: 200 }
	);
};
