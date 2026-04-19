import { GCP_CREDENTIALS_KEY } from "$env/static/private";
import { Storage } from "@google-cloud/storage";

export function getStorageClient(): Storage {
	const keyFilename = GCP_CREDENTIALS_KEY?.trim();
	if (!keyFilename) {
		throw new Error("GCP_CREDENTIALS_KEY is not configured");
	}

	return new Storage({
		keyFilename
	});
}
