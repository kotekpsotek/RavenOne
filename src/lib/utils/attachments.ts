export type AttachmentKind = "image" | "sound" | "video";

const ATTACHMENT_KIND_BY_MIME_PREFIX: Record<string, AttachmentKind> = {
	image: "image",
	audio: "sound",
	video: "video"
};

export function normalizeAttachmentKind(value: unknown): AttachmentKind | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const normalizedValue = value.trim().toLowerCase();
	if (!normalizedValue.length) {
		return undefined;
	}

	if (normalizedValue === "image" || normalizedValue === "sound" || normalizedValue === "video") {
		return normalizedValue;
	}

	const mimePrefix = normalizedValue.split("/")[0];
	return ATTACHMENT_KIND_BY_MIME_PREFIX[mimePrefix];
}

export function matchesAttachmentKind(fileType: unknown, mediaType: unknown): boolean {
	const normalizedFileType = normalizeAttachmentKind(fileType);
	const normalizedMediaType = normalizeAttachmentKind(mediaType);

	return Boolean(normalizedFileType && normalizedMediaType && normalizedFileType === normalizedMediaType);
}