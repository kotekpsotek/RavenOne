import { json, type Cookies } from '@sveltejs/kit';
import type { JWTPayload } from './jwt';
import { verifyToken } from './jwt';
import type { Profile } from "@ravenlens/shared"
import type { Document } from 'mongoose';

export function extractBearerToken(request: Request, cookies?: Cookies): string | null {
	const authorization = request.headers.get('authorization');
	if (authorization?.startsWith('Bearer ')) {
		const token = authorization.slice('Bearer '.length).trim();
		return token || null;
	}

	return cookies?.get('jwt') ?? null;
}

export function getAuthenticatedPayload(request: Request, cookies?: Cookies): JWTPayload | null {
	const token = extractBearerToken(request, cookies);
	if (!token) return null;

	try {
		return verifyToken(token);
	} catch {
		return null;
	}
}

export function buildForwardedAuthHeaders(request: Request): Headers {
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

export async function ensureAuthenticatedViaRoute(request: Request, fetchFn: typeof fetch): Promise<Response | null> {
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

export async function ensureAuthenticatedAndDownloadProfile(request: Request, fetchFn: typeof fetch): Promise<{ user: Document & Profile } | null> {
	try {
        const response = await fetchFn("/auth/me", {
            method: "GET",
            headers: buildForwardedAuthHeaders(request)
        });

		if (response.ok) {
			const responseOutput = await response.json() as { user: Profile & Document };
			return responseOutput;
		}

        return null;
    } catch {
        return null;
    }
}

export async function getAndValidateAuthenticated<T extends boolean = false>(
	request: Request,
	cookies: Cookies,
	returnWithProfile?: T,
	fetchFn: typeof fetch = fetch
): Promise<(T extends true ? { jwtPayload: JWTPayload; user: Document & Profile } : JWTPayload) | Response> {
	const userProfile = await ensureAuthenticatedAndDownloadProfile(request, fetchFn);
	if (!userProfile || !userProfile.user) {
		return json({ status: false, error: 'Failed to validate authentication' }, { status: 401 }) as any;
	}

	const payload = getAuthenticatedPayload(request, cookies);
	if (!payload) {
		return json({ status: false, error: 'Invalid or expired token' }, { status: 401 }) as any;
	}

	if (returnWithProfile) {
		return { jwtPayload: payload, user: userProfile.user } as any;
	}
	else return payload as any;
}
