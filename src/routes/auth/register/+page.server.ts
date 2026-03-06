import { dev } from '$app/environment';
import { PUBLIC_AUTH_ENDPOINT } from '$env/static/public';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

const JWT_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

type AuthErrorBody = {
	error?: string;
	message?: string;
};

type AuthSuccessBody = {
	token?: string;
};

async function readErrorMessage(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as AuthErrorBody;
		if (body.error) return body.error;
		if (body.message) return body.message;
	} catch {
		// Fall back to plain text when the response body is not JSON.
	}

	try {
		const textBody = await response.text();
		if (textBody) return textBody;
	} catch {
		// Ignore and return a generic auth error message.
	}

	return 'Authentication failed. Please try again.';
}

export const actions: Actions = {
	default: async ({ request, fetch, cookies }) => {
		const formData = await request.formData();
		const fullName = String(formData.get('fullName') ?? '').trim();
		const email = String(formData.get('email') ?? '').trim();
		const password = String(formData.get('password') ?? '');

		if (!fullName || !email || !password) {
			return fail(400, {
				error: 'Email, password, and name are required',
				values: { fullName, email }
			});
		}

		if (!PUBLIC_AUTH_ENDPOINT) {
			return fail(500, {
				error: 'Authentication service endpoint is not configured',
				values: { fullName, email }
			});
		}

		let response: Response;
		try {
			response = await fetch(`${PUBLIC_AUTH_ENDPOINT}/auth/signup`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					name: fullName,
					email,
					password
				})
			});
		} catch {
			return fail(503, {
				error: 'Authentication service is unavailable. Please try again later.',
				values: { fullName, email }
			});
		}

		if (!response.ok) {
			const errorMessage = await readErrorMessage(response);
			const status = response.status >= 400 && response.status < 600 ? response.status : 400;

			return fail(status, {
				error: errorMessage,
				values: { fullName, email }
			});
		}

		let responseBody: AuthSuccessBody;
		try {
			responseBody = (await response.json()) as AuthSuccessBody;
		} catch {
			return fail(502, {
				error: 'Authentication service returned an invalid response',
				values: { fullName, email }
			});
		}

		if (!responseBody.token) {
			return fail(502, {
				error: 'Authentication token is missing from response',
				values: { fullName, email }
			});
		}

		cookies.set('jwt', responseBody.token, {
			path: '/',
			httpOnly: false,
			sameSite: 'strict',
			secure: !dev,
			maxAge: JWT_COOKIE_MAX_AGE
		});

		throw redirect(303, '/');
	}
};
