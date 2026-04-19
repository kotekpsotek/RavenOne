import { dev } from '$app/environment';
import { generateToken } from '$lib/server/auth/jwt';
import { DB_Models } from '@ravenlens/backend';
import bcrypt from 'bcryptjs';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import type { Profile } from '$lib/sharedCompat';

const JWT_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const EMAIL_MAIN_ACCOUNT_TYPES = ['Email', 'email'];

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const formData = await request.formData();
		const email = String(formData.get('email') ?? '').trim();
		const password = String(formData.get('password') ?? '');

		if (!email || !password) {
			return fail(400, {
				error: 'Email and password are required',
				values: { email }
			});
		}

		let token: string;
		try {
			const user = (await DB_Models.UserAccount.profileModel.findOne({
				email,
				mainAccountType: { $in: EMAIL_MAIN_ACCOUNT_TYPES }
			})) as Profile | null;

			if (!user?.password || !user.id || !user.name) {
				return fail(401, {
					error: 'Invalid email or password',
					values: { email }
				});
			}

			const isPasswordValid = await bcrypt.compare(password, user.password);
			if (!isPasswordValid) {
				return fail(401, {
					error: 'Invalid email or password',
					values: { email }
				});
			}

			token = generateToken({
				userId: user.id,
				email: user.email,
				name: user.name
			});
		} catch {
			return fail(500, {
				error: 'Authentication failed',
				values: { email }
			});
		}

		cookies.set('jwt', token, {
			path: '/',
			httpOnly: false,
			sameSite: 'strict',
			secure: !dev,
			maxAge: JWT_COOKIE_MAX_AGE
		});

		throw redirect(303, '/');
	}
};
