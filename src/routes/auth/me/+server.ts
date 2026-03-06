import { DB_Models } from '@ravenlens/backend';
import { json } from '@sveltejs/kit';
import { getAuthenticatedPayload } from '$lib/server/auth/request';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, cookies }) => {
	const payload = getAuthenticatedPayload(request, cookies);
	if (!payload) {
		return json({ error: 'Invalid or expired token' }, { status: 401 });
	}

	try {
		const query: { id: string; email?: string } = { id: payload.userId };
		if (payload.email) {
			query.email = payload.email;
		}

		const user = await DB_Models.UserAccount.profileModel.findOne(query);
		if (!user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		return json({ user }, { status: 200 });
	} catch {
		return json({ error: 'Failed to load user profile' }, { status: 500 });
	}
};
