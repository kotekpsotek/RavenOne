import type { RequestHandler } from './$types';
import {
	OAUTH_PROVIDER_SCOPES,
	initPassportStrategies,
	isOAuthProvider,
	isOAuthProviderConfigured
} from '$lib/server/auth/passport';
import { beginOAuthFlow } from '$lib/server/auth/passport-runner';

function redirectToAuthCallbackError(message: string): Response {
	return new Response(null, {
		status: 303,
		headers: {
			location: `/auth/callback?error=${encodeURIComponent(message)}`
		}
	});
}

export const GET: RequestHandler = async (event) => {
	const providerParam = event.params.provider?.toLowerCase();
	if (!isOAuthProvider(providerParam)) {
		return redirectToAuthCallbackError('Invalid OAuth provider');
	}

	initPassportStrategies();

	if (!isOAuthProviderConfigured(providerParam)) {
		return redirectToAuthCallbackError(
			`${providerParam[0]?.toUpperCase()}${providerParam.slice(1)} OAuth is not configured`
		);
	}

	try {
		const redirectResult = await beginOAuthFlow(event, providerParam, {
			scope: OAUTH_PROVIDER_SCOPES[providerParam],
			session: false
		});

		return new Response(null, {
			status: redirectResult.status,
			headers: {
				location: redirectResult.location
			}
		});
	} catch (error) {
		console.error(`[auth] Failed to start OAuth for provider '${providerParam}'`, error);
		return redirectToAuthCallbackError('Authentication failed');
	}
};
