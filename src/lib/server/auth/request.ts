import { json, type Cookies } from '@sveltejs/kit';
import type { JWTPayload } from './jwt';
import { verifyToken } from './jwt';

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

export async function getAndValidateAuthenticated(request: Request, cookies: Cookies) {
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

	return payload;
}
