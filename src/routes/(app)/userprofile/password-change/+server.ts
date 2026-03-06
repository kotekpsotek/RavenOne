import { getAuthenticatedPayload } from "$lib/server/auth/request";
import { DB_Models } from "@ravenlens/backend";
import { json } from "@sveltejs/kit";
import bcrypt from "bcryptjs";
import type { RequestHandler } from "./$types";

const MIN_PASSWORD_LENGTH = 8;

type PasswordChangeRequestBody = {
	currentPassword?: string;
	newPassword?: string;
	confirmPassword?: string;
};

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;

	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
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

function validateNewPasswordCompliance(newPassword: string): string | undefined {
	if (newPassword.length < MIN_PASSWORD_LENGTH) {
		return `New password must be at least ${MIN_PASSWORD_LENGTH} characters long`;
	}

	if (/\s/.test(newPassword)) {
		return "New password cannot contain whitespace";
	}

	if (!/[a-z]/.test(newPassword)) {
		return "New password must contain a lowercase letter";
	}

	if (!/[A-Z]/.test(newPassword)) {
		return "New password must contain an uppercase letter";
	}

	if (!/\d/.test(newPassword)) {
		return "New password must contain a number";
	}

	if (!/[^A-Za-z\d]/.test(newPassword)) {
		return "New password must contain a special character";
	}

	return undefined;
}

export const POST: RequestHandler = async ({ request, cookies, fetch }) => {
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

	let requestBody: PasswordChangeRequestBody;
	try {
		requestBody = (await request.json()) as PasswordChangeRequestBody;
	} catch {
		return json({ status: false, error: "Invalid request body" }, { status: 400 });
	}

	const currentPassword = String(requestBody.currentPassword ?? "");
	const newPassword = String(requestBody.newPassword ?? "");
	const confirmPassword = String(requestBody.confirmPassword ?? "");

	if (!currentPassword || !newPassword || !confirmPassword) {
		return json(
			{ status: false, error: "Current password, new password and confirmation are required" },
			{ status: 400 }
		);
	}

	if (newPassword !== confirmPassword) {
		return json({ status: false, error: "New password and confirmation do not match" }, { status: 400 });
	}

	if (newPassword === currentPassword) {
		return json(
			{ status: false, error: "New password must be different from current password" },
			{ status: 400 }
		);
	}

	const complianceError = validateNewPasswordCompliance(newPassword);
	if (complianceError) {
		return json({ status: false, error: complianceError }, { status: 400 });
	}

	try {
		const query: { id: string; email?: string } = { id: payload.userId };
		if (payload.email) {
			query.email = payload.email;
		}

		const user = await DB_Models.UserAccount.profileModel.findOne(query);
		if (!user) {
			return json({ status: false, error: "User not found" }, { status: 404 });
		}

		const mainAccountType = String((user as { mainAccountType?: unknown }).mainAccountType ?? "").toLowerCase();
		if (mainAccountType !== "email") {
			return json(
				{ status: false, error: "Only email account users can change password" },
				{ status: 403 }
			);
		}

		const existingPasswordHash = String((user as { password?: unknown }).password ?? "");
		if (!existingPasswordHash) {
			return json(
				{ status: false, error: "Current password is not configured for this account" },
				{ status: 400 }
			);
		}

		const isCurrentPasswordValid = await bcrypt.compare(currentPassword, existingPasswordHash);
		if (!isCurrentPasswordValid) {
			return json({ status: false, error: "Current password is incorrect" }, { status: 401 });
		}

		const newPasswordHash = await bcrypt.hash(newPassword, 10);

		await DB_Models.UserAccount.profileModel.updateOne(
			{ id: (user as { id: string }).id },
			{
				$set: {
					password: newPasswordHash
				}
			}
		);

		return json(
			{
				status: true,
				message: "Password changed successfully"
			},
			{ status: 200 }
		);
	} catch (error) {
		return json(
			{
				status: false,
				error: toErrorMessage(error)
			},
			{ status: 500 }
		);
	}
};
