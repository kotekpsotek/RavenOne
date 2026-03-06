import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import {
	initPassportStrategies,
	isOAuthProvider,
	isOAuthProviderConfigured
} from '$lib/server/auth/passport';
import { completeOAuthFlow } from '$lib/server/auth/passport-runner';
import { generateToken, verifyToken } from '$lib/server/auth/jwt';

const JWT_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function redirectToAuthCallbackError(message: string): Response {
	return new Response(null, {
		status: 303,
		headers: {
			location: `/auth/callback?error=${encodeURIComponent(message)}`
		}
	});
}

function getAuthFailureMessage(info: unknown): string {
	if (typeof info === 'string' && info.trim()) {
		return info;
	}

	if (info && typeof info === 'object') {
		const maybeMessage = (info as { message?: unknown }).message;
		if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
			return maybeMessage;
		}
	}

	return 'Authentication failed';
}

export const GET: RequestHandler = async (event) => {
	const providerParam = event.params.provider?.toLowerCase();
	if (!isOAuthProvider(providerParam)) {
		return redirectToAuthCallbackError('Invalid OAuth provider');
	}

	const providerError =
		event.url.searchParams.get('error_description') || event.url.searchParams.get('error');
	if (providerError) {
		return redirectToAuthCallbackError(providerError);
	}

	initPassportStrategies();

	if (!isOAuthProviderConfigured(providerParam)) {
		return redirectToAuthCallbackError(
			`${providerParam[0]?.toUpperCase()}${providerParam.slice(1)} OAuth is not configured`
		);
	}

	const stateToken = event.url.searchParams.get('state');
	const jwtUser = stateToken ? verifyToken(stateToken) ?? undefined : undefined;

	try {
		const callbackResult = await completeOAuthFlow(
			event,
			providerParam,
			{ session: false },
			{ jwtUser }
		);

		if (!callbackResult.user) {
			return redirectToAuthCallbackError(getAuthFailureMessage(callbackResult.info));
		}

		const user = callbackResult.user as {
			id?: string;
			email?: string;
			name?: string;
			displayName?: string;
		};

		if (!user.id) {
			return redirectToAuthCallbackError('Authenticated user is missing an id');
		}

		const token = generateToken({
			userId: user.id,
			email: user.email,
			name: user.name || user.displayName || 'User'
		});

		event.cookies.set('jwt', token, {
			path: '/',
			httpOnly: false,
			sameSite: 'strict',
			secure: !dev,
			maxAge: JWT_COOKIE_MAX_AGE
		});

		return new Response(null, {
			status: 303,
			headers: {
				location: `/auth/callback?token=${encodeURIComponent(token)}`
			}
		});
	} catch (error) {
		console.error(`[auth] OAuth callback failed for provider '${providerParam}'`, error);
		return redirectToAuthCallbackError('Authentication failed');
	}
};
