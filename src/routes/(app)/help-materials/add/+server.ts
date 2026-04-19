import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { GCP_STORAGE_HELP_MATERIALS_BUCKET, HELP_MATERIALS_PUBLISH_PASSWORD } from "$env/static/private";
import { getStorageClient } from "$lib/server/gcpStorage";
import { DB_Models } from "@ravenlens/backend";
import type { HelpMaterialWithContent } from "@ravenlens/shared";
import { json } from "@sveltejs/kit";
import { v4 as uuid } from "uuid";
import type { RequestHandler } from "./$types";

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

type CreateHelpMaterialRequestBody = HelpMaterialWithContent & {
	password?: string;
	fileBase64?: string;
	category?: string;
	categories?: string[];
};

function getImageExtensionFromMime(mimeType: string): string {
	const mimeToExtension: Record<string, string> = {
		"image/jpeg": ".jpg",
		"image/png": ".png",
		"image/webp": ".webp",
		"image/gif": ".gif",
		"image/svg+xml": ".svg"
	};

	return mimeToExtension[mimeType] ?? ".bin";
}

function decodeBase64Image(fileBase64: string): { bytes: Buffer; mimeType: string } {
	const normalized = fileBase64.trim();
	if (!normalized) {
		throw new Error("Empty image payload");
	}

	const dataUrlMatch = normalized.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
	if (!dataUrlMatch) {
		throw new Error("Image payload must be a valid base64 data URL");
	}

	const mimeType = dataUrlMatch[1];
	const base64Payload = dataUrlMatch[2];

	if (!mimeType.startsWith("image/")) {
		throw new Error("Only image files are allowed");
	}

	let bytes: Buffer;
	try {
		bytes = Buffer.from(base64Payload, "base64");
	} catch {
		throw new Error("Image payload is not valid base64");
	}

	if (!bytes.length) {
		throw new Error("Image payload is empty");
	}

	if (bytes.length > MAX_IMAGE_SIZE_BYTES) {
		throw new Error("Material image has to be 10MB or smaller");
	}

	return { bytes, mimeType };
}

async function uploadMaterialImageToGCP(fileBase64: string, materialId: string): Promise<string> {
	const bucketName = GCP_STORAGE_HELP_MATERIALS_BUCKET?.trim();
	if (!bucketName) {
		throw new Error("GCP_STORAGE_HELP_MATERIALS_BUCKET is not configured");
	}

	const { bytes, mimeType } = decodeBase64Image(fileBase64);
	const imageExtension = getImageExtensionFromMime(mimeType);
	const objectName = `help-materials/${materialId}/${Date.now()}-${randomUUID()}${imageExtension}`;
	const objectPath = objectName
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");

	const storage = getStorageClient();
	const bucket = storage.bucket(bucketName);
	const uploadedFile = bucket.file(objectName);

	await uploadedFile.save(bytes, {
		resumable: false,
		contentType: mimeType,
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

function hasMeaningfulContent(value: unknown): boolean {
	if (typeof value !== "string") {
		return false;
	}

	const plain = value
		.replace(/<[^>]*>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/\s+/g, " ")
		.trim();

	return plain.length > 0;
}

function normalizeCategories(categoryValue: unknown, categoriesValue: unknown): string[] {
	const unique = new Set<string>();

	if (Array.isArray(categoriesValue)) {
		for (const value of categoriesValue) {
			const normalized = asNonEmptyString(value);
			if (normalized) {
				unique.add(normalized);
			}
		}
	}

	const categoryAsString = asNonEmptyString(categoryValue);
	if (categoryAsString) {
		for (const category of categoryAsString.split(",")) {
			const normalized = category.trim();
			if (normalized) {
				unique.add(normalized);
			}
		}
	}

	return Array.from(unique);
}

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

export const POST: RequestHandler = async ({ request }) => {
	let requestBody: CreateHelpMaterialRequestBody;
	try {
		requestBody = (await request.json()) as CreateHelpMaterialRequestBody;
	} catch {
		return json({ status: false, error: "Invalid request body" }, { status: 400 });
	}

	if (requestBody.password !== HELP_MATERIALS_PUBLISH_PASSWORD) {
		return json({ status: false, error: "Unauthorized" }, { status: 401 });
	}

	const title = asNonEmptyString(requestBody.title);
	const description = asNonEmptyString(requestBody.description);
	const content = typeof requestBody.content === "string" ? requestBody.content : "";
	const categories = normalizeCategories(requestBody.category, requestBody.categories);

	if (!title || !description || !hasMeaningfulContent(content)) {
		return json(
			{
				status: false,
				error: "title, description and content are required"
			},
			{ status: 400 }
		);
	}

	const materialId = `help-material:${uuid()}`;

	try {
		let imgURL = "";
		const fileBase64 = asNonEmptyString(requestBody.fileBase64);
		if (fileBase64) {
			imgURL = await uploadMaterialImageToGCP(fileBase64, materialId);
		}

		await DB_Models.Help.helpMaterialModel.create({
			id: materialId,
			title,
			description,
			content,
			imgURL,
			categories,
			publicationDate: new Date(),
			author: requestBody.author ? requestBody.author : undefined
		});

		return json(
			{
				status: true,
				materialId,
				imgURL
			},
			{ status: 201 }
		);
	} catch (err) {
		const message = toErrorMessage(err);
		console.error("Cannot save material", err);
		return json({ status: false, error: message }, { status: 500 });
	}
};