import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { env } from "$env/dynamic/private";
import { ensureAuthenticatedViaRoute, getAuthenticatedPayload } from "$lib/server/auth/request";
import { prefetchWorkspaceWithMembers } from "$lib/server/db";
import { getWorkspaceActiveSubscription } from "$lib/server/subscription";
import { DB_Models } from "@ravenlens/backend";
import { Storage } from "@google-cloud/storage";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

const MAX_WORKSPACE_NAME_LENGTH = 128;
const MAX_WORKSPACE_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

type DeleteWorkspaceRequestBody = {
	workspaceId?: unknown;
};

type WorkspaceImageUploadProjection = {
	imageUrl?: unknown;
};

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === "string") {
		return error;
	}

	try {
		return JSON.stringify(error);
	} catch {
		return "Unknown error";
	}
}

function getStorageClient(): Storage {
	const keyFilename = env.GCP_CREDENTIALS_KEY?.trim();
	if (!keyFilename) {
		throw new Error("GCP_CREDENTIALS_KEY is not configured");
	}

	return new Storage({
		keyFilename
	});
}

function getImageExtension(imageFile: File): string {
	const fromName = imageFile.name.split(".").pop()?.trim().toLowerCase();
	if (fromName && /^[a-z0-9]{1,10}$/.test(fromName)) {
		return `.${fromName}`;
	}

	const mimeToExtension: Record<string, string> = {
		"image/jpeg": ".jpg",
		"image/png": ".png",
		"image/webp": ".webp",
		"image/gif": ".gif",
		"image/svg+xml": ".svg"
	};

	return mimeToExtension[imageFile.type] ?? ".bin";
}

async function uploadWorkspaceImageToGoogleStorage(workspaceId: string, imageFile: File): Promise<string> {
	const bucketName = env.GCP_STORAGE_BUCKET?.trim();
	if (!bucketName) {
		throw new Error("GCP_STORAGE_BUCKET is not configured");
	}

	if (!imageFile.type.startsWith("image/")) {
		throw new Error("Only image files are allowed");
	}

	if (imageFile.size > MAX_WORKSPACE_IMAGE_SIZE_BYTES) {
		throw new Error("Workspace image has to be 10MB or smaller");
	}

	const imageExtension = getImageExtension(imageFile);
	const objectName = `workspaces/${workspaceId}/${Date.now()}-${randomUUID()}${imageExtension}`;
	const objectPath = objectName
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");

	const storage = getStorageClient();
	const bucket = storage.bucket(bucketName);
	const uploadedFile = bucket.file(objectName);

	const bytes = Buffer.from(await imageFile.arrayBuffer());

	await uploadedFile.save(bytes, {
		resumable: false,
		contentType: imageFile.type || "application/octet-stream",
		metadata: {
			cacheControl: "public, max-age=31536000"
		}
	});

	const publicUrl = `https://storage.googleapis.com/${bucketName}/${objectPath}`;

	try {
		await uploadedFile.makePublic();
		return publicUrl;
	} catch {
		const [signedUrl] = await uploadedFile.getSignedUrl({
			action: "read",
			expires: Date.now() + 1000 * 60 * 60 * 24 * 365
		});

		return signedUrl;
	}
}

function asNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length ? trimmed : undefined;
}

async function readWorkspaceId(request: Request, url: URL): Promise<string | undefined> {
	const workspaceIdFromQuery = asNonEmptyString(url.searchParams.get("workspaceId"));
	if (workspaceIdFromQuery) {
		return workspaceIdFromQuery;
	}

	let requestBody: DeleteWorkspaceRequestBody;
	try {
		requestBody = (await request.json()) as DeleteWorkspaceRequestBody;
	} catch {
		return undefined;
	}

	return asNonEmptyString(requestBody.workspaceId);
}

function readWorkspaceIdFromFormData(url: URL, formData: FormData): string | undefined {
	const workspaceIdFromQuery = asNonEmptyString(url.searchParams.get("workspaceId"));
	if (workspaceIdFromQuery) {
		return workspaceIdFromQuery;
	}

	return asNonEmptyString(formData.get("workspaceId"));
}

function normalizeWorkspaceName(nameCandidate: unknown): string | undefined {
	const workspaceName = asNonEmptyString(nameCandidate);
	if (!workspaceName) {
		return undefined;
	}

	if (workspaceName.length > MAX_WORKSPACE_NAME_LENGTH) {
		return undefined;
	}

	return workspaceName;
}

export const POST: RequestHandler = async ({ request, cookies, fetch, url }) => {
	const authStatusResponse = await ensureAuthenticatedViaRoute(request, fetch);
	if (!authStatusResponse) {
		return json({ status: false, error: "Failed to validate authentication" }, { status: 500 });
	}

	if (!authStatusResponse.ok) {
		return json({ status: false, error: "Unauthorized" }, { status: 401 });
	}

	const payload = getAuthenticatedPayload(request, cookies);
	if (!payload) {
		return json({ status: false, error: "Invalid or expired token" }, { status: 401 });
	}

	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return json({ status: false, error: "Invalid request body" }, { status: 400 });
	}

	const workspaceId = readWorkspaceIdFromFormData(url, formData);
	if (!workspaceId) {
		return json({ status: false, error: "workspaceId is required" }, { status: 400 });
	}

	const workspaceName = normalizeWorkspaceName(formData.get("name"));
	if (!workspaceName) {
		return json(
			{
				status: false,
				error: `Workspace name is required and cannot exceed ${MAX_WORKSPACE_NAME_LENGTH} characters`
			},
			{ status: 400 }
		);
	}

	const imageCandidate = formData.get("image");
	const imageFile = imageCandidate instanceof File && imageCandidate.size > 0 ? imageCandidate : null;
	const imageUrlCandidate = asNonEmptyString(formData.get("imageUrl"));

	try {
		const workspace = await prefetchWorkspaceWithMembers(workspaceId);
		if (!workspace) {
			return json({ status: false, error: "Workspace not found" }, { status: 404 });
		}

		const workspaceMembers = Array.isArray(workspace.workspaceMembers) ? workspace.workspaceMembers : [];

		const thisUserAWorkspaceMember = workspaceMembers.find((member) => member.user.id === payload.userId);
		if (!thisUserAWorkspaceMember) {
			return json({ status: false, error: "Only workspace members can update this workspace" }, { status: 403 });
		}

		const canUpdateWorkspace = workspace.ownerUserId === payload.userId
			|| thisUserAWorkspaceMember.permissions.includes("manage_workspace_settings");

		if (!canUpdateWorkspace) {
			return json(
				{ status: false, error: "Only workspace owner or members with manage_workspace_settings can update this workspace" },
				{ status: 403 }
			);
		}

		const workspaceSubscription = await getWorkspaceActiveSubscription(workspaceId);
		if (!workspaceSubscription.hasActiveSubscription) {
			return json(
				{ status: false, error: "Cannot update workspace settings because this workspace has no active subscription" },
				{ status: 401 }
			);
		}

		const existingWorkspace = await DB_Models.Workspace.Workspace.workspaceModel
			.findOne({ id: workspaceId })
			.select({ imageUrl: 1, _id: 0 })
			.lean<WorkspaceImageUploadProjection>();

		if (!existingWorkspace) {
			return json({ status: false, error: "Workspace not found" }, { status: 404 });
		}

		const duplicateWorkspace = await DB_Models.Workspace.Workspace.workspaceModel
			.findOne({
				ownerUserId: workspace.ownerUserId,
				name: workspaceName,
				id: { $ne: workspaceId }
			})
			.select({ id: 1, _id: 0 })
			.lean();

		if (duplicateWorkspace) {
			return json(
				{
					status: false,
					error: "Workspace with this name already exists"
				},
				{ status: 409 }
			);
		}

		let uploadedImageUrl = asNonEmptyString(existingWorkspace.imageUrl) ?? "";

		if (imageFile) {
			uploadedImageUrl = await uploadWorkspaceImageToGoogleStorage(workspaceId, imageFile);
		} else if (imageUrlCandidate) {
			uploadedImageUrl = imageUrlCandidate;
		}

		await DB_Models.Workspace.Workspace.workspaceModel.updateOne(
			{
				id: workspaceId,
				ownerUserId: workspace.ownerUserId
			},
			{
				$set: {
					name: workspaceName,
					imageUrl: uploadedImageUrl
				}
			}
		);

		return json(
			{
				status: true,
				saved: true,
				workspace: {
					id: workspaceId,
					name: workspaceName,
					imageUrl: uploadedImageUrl,
					ownerUserId: workspace.ownerUserId
				}
			},
			{ status: 200 }
		);
	} catch (error) {
		return json({ status: false, error: toErrorMessage(error) }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request, cookies, fetch, url }) => {
	const authStatusResponse = await ensureAuthenticatedViaRoute(request, fetch);
	if (!authStatusResponse) {
		return json({ status: false, error: "Failed to validate authentication" }, { status: 500 });
	}

	if (!authStatusResponse.ok) {
		return json({ status: false, error: "Unauthorized" }, { status: 401 });
	}

	const payload = getAuthenticatedPayload(request, cookies);
	if (!payload) {
		return json({ status: false, error: "Invalid or expired token" }, { status: 401 });
	}

	const workspaceId = await readWorkspaceId(request, url);
	if (!workspaceId) {
		return json({ status: false, error: "workspaceId is required" }, { status: 400 });
	}

	try {
		const workspace = await prefetchWorkspaceWithMembers(workspaceId);
		if (!workspace) {
			return json({ status: false, error: "Workspace not found" }, { status: 404 });
		}

		const workspaceMembers = Array.isArray(workspace.workspaceMembers) ? workspace.workspaceMembers : [];

		const thisUserAWorkspaceMember = workspaceMembers.find((member) => member.user.id === payload.userId);
		if (!thisUserAWorkspaceMember) {
			return json({ status: false, error: "Only workspace members can delete this workspace" }, { status: 403 });
		}

		const canDeleteWorkspace = workspace.ownerUserId === payload.userId
			|| thisUserAWorkspaceMember.permissions.includes("manage_workspace_settings");

		if (!canDeleteWorkspace) {
			return json(
				{ status: false, error: "Only workspace owner or members with manage_workspace_settings can delete this workspace" },
				{ status: 403 }
			);
		}

		const deletedWorkspace = await DB_Models.Workspace.Workspace.workspaceModel
			.findOneAndDelete({ id: workspaceId })
			.lean();

		if (!deletedWorkspace) {
			return json({ status: false, error: "Workspace not found" }, { status: 404 });
		}

		return json(
			{
				status: true,
				deleted: true,
				workspaceId
			},
			{ status: 200 }
		);
	} catch {
		return json({ status: false, error: "Failed to delete workspace" }, { status: 500 });
	}
};
