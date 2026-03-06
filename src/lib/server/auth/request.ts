import type { Cookies } from '@sveltejs/kit';
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
