import { Buffer } from "node:buffer";
import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { dev } from "$app/environment";
import { env } from "$env/dynamic/private";
import { getAuthenticatedPayload } from "$lib/server/auth/request";
import { DB_Models } from "@ravenlens/backend";
import { Storage } from "@google-cloud/storage";
import { json } from "@sveltejs/kit";
import jwt from "jsonwebtoken";
import { Resend } from "resend";
import type { RequestHandler } from "./$types";
import { appName } from "$lib/config/app";

const MAX_PROFILE_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const DELETE_CODE_LENGTH = 6;
const DELETE_CODE_COOKIE = "account-delete-challenge";
const DELETE_CODE_EXPIRES_SECONDS = 10 * 60;
const DELETE_CODE_PURPOSE = "delete-account";

type DeleteCodeActionBody = {
    action?: string;
};

type DeleteCodeConfirmationBody = {
    code?: string;
};

type DeleteCodeChallengePayload = {
    purpose: string;
    userId: string;
    email: string;
    codeHash: string;
};

function normalizePrivateKey(privateKey: string): string {
    return privateKey.replace(/\\n/g, "\n");
}

function toErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;

    try {
        return JSON.stringify(err);
    } catch {
        return String(err);
    }
}

function getJwtSecret(): string {
    const jwtSecret = env.JWT_SECRET?.trim();
    if (!jwtSecret) {
        throw new Error("JWT_SECRET environment variable is required");
    }

    return jwtSecret;
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

async function uploadImageToGoogleStorage(userId: string, imageFile: File): Promise<string> {
    const bucketName = env.GCP_STORAGE_BUCKET?.trim();
    if (!bucketName) {
        throw new Error("GCP_STORAGE_BUCKET is not configured");
    }

    if (!imageFile.type.startsWith("image/")) {
        throw new Error("Only image files are allowed");
    }

    if (imageFile.size > MAX_PROFILE_IMAGE_SIZE_BYTES) {
        throw new Error("Profile image has to be 10MB or smaller");
    }

    const imageExtension = getImageExtension(imageFile);
    const objectName = `profiles/${userId}/${Date.now()}-${randomUUID()}${imageExtension}`;
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

function createDeleteVerificationCode(): string {
    return String(randomInt(0, 10 ** DELETE_CODE_LENGTH)).padStart(DELETE_CODE_LENGTH, "0");
}

function hashDeleteVerificationCode(userId: string, code: string): string {
    const jwtSecret = getJwtSecret();
    return createHash("sha256").update(`${userId}:${code}:${jwtSecret}`).digest("hex");
}

function isSafeHexEqual(expectedHex: string, candidateHex: string): boolean {
    if (expectedHex.length !== candidateHex.length) {
        return false;
    }

    try {
        return timingSafeEqual(Buffer.from(expectedHex, "hex"), Buffer.from(candidateHex, "hex"));
    } catch {
        return false;
    }
}

async function sendDeleteCodeEmail(targetEmail: string, code: string): Promise<void> {
    const resendApiKey = env.RESEND_API_KEY?.trim();
    const resendFromEmail = env.RESEND_FROM_EMAIL?.trim();

    if (!resendApiKey) {
        throw new Error("RESEND_API_KEY is not configured");
    }
    if (!resendFromEmail) {
        throw new Error("RESEND_FROM_EMAIL is not configured");
    }

    const resend = new Resend(resendApiKey);
    const { error } = await resend.emails.send({
        from: resendFromEmail,
        to: [targetEmail],
        subject: `Your ${appName} account deletion verification code`,
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
                <h2 style="margin: 0 0 12px;">Confirm account deletion</h2>
                <p style="margin: 0 0 12px;">Use this 6-digit code to confirm account deletion:</p>
                <p style="font-size: 26px; font-weight: 700; letter-spacing: 6px; margin: 0 0 12px;">${code}</p>
                <p style="margin: 0; color: #475569;">This code expires in 10 minutes. If you did not request this action, ignore this email.</p>
            </div>
        `,
        text: `Confirm account deletion with this code: ${code}. This code expires in 10 minutes.`
    });

    if (error) {
        throw new Error(error.message || "Failed to send verification email");
    }
}

async function handleDeleteCodeRequest(request: Request, cookies: Parameters<RequestHandler>[0]["cookies"], fetchFn: typeof fetch) {
    const authStatusResponse = await ensureAuthenticatedViaRoute(request, fetchFn);
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

    try {
        const query: { id: string; email?: string } = { id: payload.userId };
        if (payload.email) {
            query.email = payload.email;
        }

        const user = await DB_Models.UserAccount.profileModel.findOne(query);
        if (!user) {
            return json({ status: false, error: "User not found" }, { status: 404 });
        }

        const userEmail = String((user as { email?: string }).email ?? "").trim();
        if (!userEmail) {
            return json({ status: false, error: "No email is attached to this account" }, { status: 400 });
        }

        const code = createDeleteVerificationCode();
        const codeHash = hashDeleteVerificationCode(payload.userId, code);

        const challengeToken = jwt.sign(
            {
                purpose: DELETE_CODE_PURPOSE,
                userId: payload.userId,
                email: userEmail,
                codeHash
            } satisfies DeleteCodeChallengePayload,
            getJwtSecret(),
            { expiresIn: `${DELETE_CODE_EXPIRES_SECONDS}s` }
        );

        cookies.set(DELETE_CODE_COOKIE, challengeToken, {
            path: "/",
            httpOnly: true,
            sameSite: "strict",
            secure: !dev,
            maxAge: DELETE_CODE_EXPIRES_SECONDS
        });

        await sendDeleteCodeEmail(userEmail, code);

        return json(
            {
                status: true,
                message: `6-digit code was sent to \"${userEmail}\"`,
                email: userEmail
            },
            { status: 200 }
        );
    } catch (err) {
        cookies.delete(DELETE_CODE_COOKIE, { path: "/" });
        return json({ status: false, error: toErrorMessage(err) }, { status: 500 });
    }
}

export const POST: RequestHandler = async ({ request, cookies, fetch }) => {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
        let requestBody: DeleteCodeActionBody;
        try {
            requestBody = (await request.json()) as DeleteCodeActionBody;
        } catch {
            return json({ status: false, error: "Invalid request body" }, { status: 400 });
        }

        if (requestBody.action === "send-delete-code") {
            return handleDeleteCodeRequest(request, cookies, fetch);
        }

        return json({ status: false, error: "Unsupported action" }, { status: 400 });
    }

    const payload = getAuthenticatedPayload(request, cookies);
    if (!payload) {
        return json({ status: false, error: "Invalid or expired token" }, { status: 401 });
    }

    try {
        const formData = await request.formData();
        const name = String(formData.get("name") ?? "").trim();
        const imageCandidate = formData.get("image");
        const imageFile = imageCandidate instanceof File && imageCandidate.size > 0 ? imageCandidate : null;

        if (!name && !imageFile) {
            return json(
                {
                    status: false,
                    error: "No profile changes were provided"
                },
                { status: 400 }
            );
        }

        const query: { id: string; email?: string } = { id: payload.userId };
        if (payload.email) {
            query.email = payload.email;
        }

        const existingUser = await DB_Models.UserAccount.profileModel.findOne(query);
        if (!existingUser) {
            return json({ status: false, error: "User not found" }, { status: 404 });
        }

        const updatedName = name || String(existingUser.name ?? "").trim();
        if (!updatedName) {
            return json({ status: false, error: "Name cannot be empty" }, { status: 400 });
        }

        let uploadedImageUrl = String(existingUser.profileImgURL ?? "");
        if (imageFile) {
            uploadedImageUrl = await uploadImageToGoogleStorage(payload.userId, imageFile);
        }

        await DB_Models.UserAccount.profileModel.updateOne(
            { id: existingUser.id },
            {
                $set: {
                    name: updatedName,
                    profileImgURL: uploadedImageUrl
                }
            }
        );

        const updatedUser = await DB_Models.UserAccount.profileModel.findOne({ id: existingUser.id });

        return json(
            {
                status: true,
                message: "Profile updated",
                user: updatedUser
            },
            { status: 200 }
        );
    } catch (err) {
        return json(
            {
                status: false,
                error: toErrorMessage(err)
            },
            { status: 500 }
        );
    }
};

export const DELETE: RequestHandler = async ({ request, cookies, fetch }) => {
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

    let requestBody: DeleteCodeConfirmationBody;
    try {
        requestBody = (await request.json()) as DeleteCodeConfirmationBody;
    } catch {
        return json({ status: false, error: "Verification code is required" }, { status: 400 });
    }

    const code = String(requestBody.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) {
        return json({ status: false, error: "Verification code has to contain 6 digits" }, { status: 400 });
    }

    const challengeToken = cookies.get(DELETE_CODE_COOKIE);
    if (!challengeToken) {
        return json(
            {
                status: false,
                error: "Verification code expired. Request a new code and try again"
            },
            { status: 409 }
        );
    }

    let challengePayload: DeleteCodeChallengePayload;
    try {
        challengePayload = jwt.verify(challengeToken, getJwtSecret()) as DeleteCodeChallengePayload;
    } catch {
        cookies.delete(DELETE_CODE_COOKIE, { path: "/" });
        return json(
            {
                status: false,
                error: "Verification code expired. Request a new code and try again"
            },
            { status: 409 }
        );
    }

    if (challengePayload.purpose !== DELETE_CODE_PURPOSE || challengePayload.userId !== payload.userId) {
        cookies.delete(DELETE_CODE_COOKIE, { path: "/" });
        return json({ status: false, error: "Invalid deletion verification session" }, { status: 409 });
    }

    const candidateCodeHash = hashDeleteVerificationCode(payload.userId, code);
    if (!isSafeHexEqual(challengePayload.codeHash, candidateCodeHash)) {
        return json({ status: false, error: "Invalid verification code" }, { status: 400 });
    }

    try {
        const query: { id: string; email?: string } = { id: payload.userId };
        if (payload.email) {
            query.email = payload.email;
        }

        const deletedUser = await DB_Models.UserAccount.profileModel.findOneAndDelete(query);
        if (!deletedUser) {
            return json({ status: false, error: "User not found" }, { status: 404 });
        }

        cookies.delete("jwt", { path: "/" });
        cookies.delete(DELETE_CODE_COOKIE, { path: "/" });

        return json({ status: true, deleted: true }, { status: 200 });
    } catch {
        return json({ status: false, error: "Failed to delete account" }, { status: 500 });
    }
};
