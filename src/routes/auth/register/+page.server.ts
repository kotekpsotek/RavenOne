import { randomUUID } from 'node:crypto';
import { dev } from '$app/environment';
import { generateToken } from '$lib/server/auth/jwt';
import { autoJoinUserToInvitedWorkspaces } from '$lib/server/workspace-invitements';
import { DB_Models } from '@ravenlens/backend';
import bcrypt from 'bcryptjs';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import type { Profile } from '@ravenlens/shared';

const JWT_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const EMAIL_MAIN_ACCOUNT_TYPES = ['Email', 'email'];

export const actions: Actions = {
	default: async ({ request, cookies }) => {
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

		let token: string;
		try {
			const existingUser = await DB_Models.UserAccount.profileModel.findOne({
				email,
				mainAccountType: { $in: EMAIL_MAIN_ACCOUNT_TYPES }
			});

			if (existingUser) {
				return fail(400, {
					error: 'User already exists with this email',
					values: { fullName, email }
				});
			}

			const hashedPassword = await bcrypt.hash(password, 10);
			const user = (await DB_Models.UserAccount.profileModel.create({
				id: randomUUID(),
				name: fullName,
				email,
				password: hashedPassword,
				profileImgURL: '',
				mainAccountType: 'email',
				linkedAccounts: ['email'],
				createdAt: new Date()
			} as Profile));

			if (!user.id || !user.name) {
				return fail(500, {
					error: 'Failed to create user',
					values: { fullName, email }
				});
			}

			try {
				await autoJoinUserToInvitedWorkspaces({
					userId: user.id,
					userObjectId: (user as { _id?: unknown })._id,
					email: user.email
				});
			} catch (invitationReconciliationError) {
				console.error('Failed to auto-join invited workspaces after register', invitationReconciliationError);
			}

			token = generateToken({
				userId: user.id,
				email: user.email,
				name: user.name
			});
		} catch (error) {
			console.error('Register action failed', error);
			return fail(500, {
				error: 'Failed to create user',
				values: { fullName, email }
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
