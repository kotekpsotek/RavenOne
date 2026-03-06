import { getAuthenticatedPayload } from '$lib/server/auth/request';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, cookies }) => {
	const payload = getAuthenticatedPayload(request, cookies);
	if (!payload) {
		return new Response(null, { status: 401 });
	}

	return new Response(null, { status: 200 });
};
