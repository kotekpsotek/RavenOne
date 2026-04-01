import { randomUUID } from 'node:crypto';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as LinkedInStrategy } from 'passport-linkedin-oauth2';
import { env } from '$env/dynamic/private';
import { DB_Models } from '@ravenlens/backend';
import type { AccountType, Profile } from '@ravenlens/shared';
import type { JWTPayload } from './jwt';
import { autoJoinUserToInvitedWorkspaces } from '$lib/server/workspace-invitements';
import { appName } from '$lib/config/app';

export type OAuthProvider = 'google' | 'github' | 'linkedin';
const EMAIL_ALREADY_IN_USE_MESSAGE =
	'This email is already assigned to an existing account. Please sign in using the original authentication method.';

type StrategyRequest = {
	jwtUser?: JWTPayload;
};

const configuredProviders = new Set<OAuthProvider>();
let isPassportSessionSerializerRegistered = false;

export const OAUTH_PROVIDER_SCOPES: Record<OAuthProvider, string[]> = {
	google: ['profile', 'email'],
	github: ['user:email'],
	linkedin: ['openid', 'profile', 'email']
};

export function isOAuthProvider(value: string | undefined): value is OAuthProvider {
	return value === 'google' || value === 'github' || value === 'linkedin';
}

export function isOAuthProviderConfigured(provider: OAuthProvider): boolean {
	return configuredProviders.has(provider);
}

type GitHubEmailCandidate = {
	email?: string;
	value?: string;
	primary?: boolean;
	verified?: boolean;
};

function normalizeEmailAddress(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}

	const normalized = value.trim().toLowerCase();
	if (!normalized || !normalized.includes('@')) {
		return undefined;
	}

	return normalized;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findUserByEmail(email: string) {
	const escapedEmail = escapeRegExp(email);
	return DB_Models.UserAccount.profileModel.findOne({
		email: { $regex: `^${escapedEmail}$`, $options: 'i' }
	});
}

async function isEmailTakenByAnotherUser(email: string | undefined, currentUserId?: string): Promise<boolean> {
	if (!email) {
		return false;
	}

	const existingUserWithEmail = await findUserByEmail(email);
	if (!existingUserWithEmail) {
		return false;
	}

	if (!currentUserId) {
		return true;
	}

	return String((existingUserWithEmail as any).id) !== currentUserId;
}

function pickGithubEmail(candidates: GitHubEmailCandidate[]): string | undefined {
	const normalizedCandidates = candidates
		.map((candidate) => ({
			email: normalizeEmailAddress(candidate.email ?? candidate.value),
			primary: candidate.primary === true,
			verified: candidate.verified === true
		}))
		.filter((candidate): candidate is { email: string; primary: boolean; verified: boolean } => Boolean(candidate.email));

	if (!normalizedCandidates.length) {
		return undefined;
	}

	const primaryVerified = normalizedCandidates.find((candidate) => candidate.primary && candidate.verified);
	if (primaryVerified) return primaryVerified.email;

	const verified = normalizedCandidates.find((candidate) => candidate.verified);
	if (verified) return verified.email;

	const primary = normalizedCandidates.find((candidate) => candidate.primary);
	if (primary) return primary.email;

	return normalizedCandidates[0].email;
}

async function resolveGithubEmail(accessToken: string, profile: any): Promise<string | undefined> {
	const profileEmail = pickGithubEmail(Array.isArray(profile?.emails) ? profile.emails : []);
	if (profileEmail) {
		return profileEmail;
	}

	try {
		const response = await fetch('https://api.github.com/user/emails', {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28',
				'User-Agent': appName
			}
		});

		if (!response.ok) {
			return undefined;
		}

		const responseBody = (await response.json()) as GitHubEmailCandidate[];
		if (!Array.isArray(responseBody)) {
			return undefined;
		}

		return pickGithubEmail(responseBody);
	} catch {
		return undefined;
	}
}

function shouldSyncGithubEmail(user: any, githubEmail: string | undefined): githubEmail is string {
	if (!githubEmail) {
		return false;
	}

	if (!normalizeEmailAddress(user?.email)) {
		return true;
	}

	return String(user?.mainAccountType ?? '').toLowerCase() === 'github';
}

function registerGoogleStrategy() {
	if (configuredProviders.has('google')) return;
	if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return;

	passport.use(
		new (GoogleStrategy as any)(
			{
				clientID: env.GOOGLE_CLIENT_ID,
				clientSecret: env.GOOGLE_CLIENT_SECRET,
				callbackURL: env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
				passReqToCallback: true
			},
			async (req: StrategyRequest, accessToken: string, _refreshToken: string, profile: any, done: any) => {
				try {
					const googleEmail = normalizeEmailAddress(profile.emails?.[0]?.value);

					if (req.jwtUser) {
						const existingOtherUser = await DB_Models.UserAccount.profileModel.findOne({
							'googleAccountProperties.googleId': profile.id
						});
						if (existingOtherUser && (existingOtherUser as any).id !== req.jwtUser.userId) {
							return done(null, false, {
								message: 'This Google account is already linked to another user'
							});
						}

						if (await isEmailTakenByAnotherUser(googleEmail, req.jwtUser.userId)) {
							return done(null, false, { message: EMAIL_ALREADY_IN_USE_MESSAGE });
						}

						const user = await DB_Models.UserAccount.profileModel.findOne({ id: req.jwtUser.userId });
						if (user) {
							const linkedAccounts = ((user as any).toObject().linkedAccounts ?? []) as string[];
							const isAlreadyLinked = linkedAccounts.some((account) => account.toLowerCase() === 'google');

							if (!isAlreadyLinked) {
								await DB_Models.UserAccount.profileModel.updateOne(
									{ id: (user as any).id },
									{
										$push: { linkedAccounts: 'Google' as AccountType },
										$set: {
											googleAccountProperties: {
												googleId: profile.id,
												email: profile.emails?.[0]?.value || '',
												accessToken
											}
										}
									}
								);
								const updatedUser = await DB_Models.UserAccount.profileModel.findOne({ id: (user as any).id });
								return done(null, updatedUser);
							}

							return done(null, user);
						}
					}

					let user = await DB_Models.UserAccount.profileModel.findOne({
						'googleAccountProperties.googleId': profile.id
					});

					if (!user) {
						if (await isEmailTakenByAnotherUser(googleEmail)) {
							return done(null, false, { message: EMAIL_ALREADY_IN_USE_MESSAGE });
						}

						const newProfile: Profile = {
							id: randomUUID(),
							name: profile.displayName || 'Google User',
							email: googleEmail,
							profileImgURL: profile.photos?.[0]?.value || '',
							mainAccountType: 'Google' as AccountType,
							googleAccountProperties: {
								googleId: profile.id,
								email: googleEmail || '',
								accessToken
							},
							linkedAccounts: ['Google' as AccountType],
							createdAt: new Date()
						};

						user = await DB_Models.UserAccount.profileModel.create(newProfile as any);

						try {
							await autoJoinUserToInvitedWorkspaces({
								userId: user.id,
								userObjectId: user._id,
								email: user.email
							});
						} catch (invitationReconciliationError) {
							console.error('[auth] Failed to auto-join invited workspaces after Google signup', invitationReconciliationError);
						}
					}

					return done(null, user);
				} catch (error) {
					return done(error as Error);
				}
			}
		)
	);

	configuredProviders.add('google');
}

function registerGithubStrategy() {
	if (configuredProviders.has('github')) return;
	if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return;

	passport.use(
		new (GitHubStrategy as any)(
			{
				clientID: env.GITHUB_CLIENT_ID,
				clientSecret: env.GITHUB_CLIENT_SECRET,
				callbackURL: env.GITHUB_CALLBACK_URL || '/auth/github/callback',
				passReqToCallback: true,
			},
			async (req: StrategyRequest, accessToken: string, _refreshToken: string, profile: any, done: any) => {
				try {
					const githubUserId = Number.parseInt(String(profile.id), 10);
					if (Number.isNaN(githubUserId)) {
						return done(null, false, { message: 'Could not identify GitHub account' });
					}

					const githubUserName = profile.username || profile.displayName || 'GitHub User';
					const githubEmail = await resolveGithubEmail(accessToken, profile);

					if (req.jwtUser) {
						const existingOtherUser = await DB_Models.UserAccount.profileModel.findOne({
							'githubAccountProperties.githubUserId': githubUserId
						});
						if (existingOtherUser && (existingOtherUser as any).id !== req.jwtUser.userId) {
							return done(null, false, { message: 'This GitHub account is already linked to another user' });
						}

						const user = await DB_Models.UserAccount.profileModel.findOne({ id: req.jwtUser.userId });
						if (user) {
							if (shouldSyncGithubEmail(user, githubEmail) && (await isEmailTakenByAnotherUser(githubEmail, req.jwtUser.userId))) {
								return done(null, false, { message: EMAIL_ALREADY_IN_USE_MESSAGE });
							}

							const linkedAccounts = ((user as any).toObject().linkedAccounts ?? []) as string[];
							const isAlreadyLinked = linkedAccounts.some((account) => account.toLowerCase() === 'github');
							const setPayload: Record<string, unknown> = {
								githubAccountProperties: {
									githubUserId,
									githubUserName,
									githubAccessToken: accessToken
								}
							};

							if (shouldSyncGithubEmail(user, githubEmail)) {
								setPayload.email = githubEmail;
							}

							if (!isAlreadyLinked) {
								await DB_Models.UserAccount.profileModel.updateOne(
									{ id: (user as any).id },
									{
										$push: { linkedAccounts: 'Github' as AccountType },
										$set: setPayload
									}
								);
								const updatedUser = await DB_Models.UserAccount.profileModel.findOne({ id: (user as any).id });
								return done(null, updatedUser);
							}

							await DB_Models.UserAccount.profileModel.updateOne(
								{ id: (user as any).id },
								{
									$set: setPayload
								}
							);
							const refreshedUser = await DB_Models.UserAccount.profileModel.findOne({ id: (user as any).id });

							return done(null, refreshedUser ?? user);
						}
					}

					let user = await DB_Models.UserAccount.profileModel.findOne({
						'githubAccountProperties.githubUserId': githubUserId
					});

					if (!user) {
						if (await isEmailTakenByAnotherUser(githubEmail)) {
							return done(null, false, { message: EMAIL_ALREADY_IN_USE_MESSAGE });
						}

						const newProfile: Profile = {
							id: randomUUID(),
							name: profile.displayName || githubUserName,
							email: githubEmail,
							profileImgURL: profile.photos?.[0]?.value || '',
							mainAccountType: 'Github' as AccountType,
							githubAccountProperties: {
								githubUserId,
								githubUserName,
								githubAccessToken: accessToken
							},
							linkedAccounts: ['Github' as AccountType],
							createdAt: new Date()
						};

						user = await DB_Models.UserAccount.profileModel.create(newProfile as any);

						try {
							await autoJoinUserToInvitedWorkspaces({
								userId: user.id,
								userObjectId: user._id,
								email: user.email
							});
						} catch (invitationReconciliationError) {
							console.error('[auth] Failed to auto-join invited workspaces after GitHub signup', invitationReconciliationError);
						}
					} else {
						if (shouldSyncGithubEmail(user, githubEmail) && (await isEmailTakenByAnotherUser(githubEmail, String((user as any).id)))) {
							return done(null, false, { message: EMAIL_ALREADY_IN_USE_MESSAGE });
						}

						const setPayload: Record<string, unknown> = {
							githubAccountProperties: {
								githubUserId,
								githubUserName,
								githubAccessToken: accessToken
							}
						};

						if (shouldSyncGithubEmail(user, githubEmail)) {
							setPayload.email = githubEmail;
						}

						await DB_Models.UserAccount.profileModel.updateOne(
							{ id: (user as any).id },
							{
								$set: setPayload
							}
						);
						const refreshedUser = await DB_Models.UserAccount.profileModel.findOne({ id: (user as any).id });
						if (refreshedUser) {
							user = refreshedUser;
						}
					}

					return done(null, user);
				} catch (error) {
					return done(error as Error);
				}
			}
		)
	);

	configuredProviders.add('github');
}

function registerLinkedInStrategy() {
	if (configuredProviders.has('linkedin')) return;
	if (!env.LINKEDIN_CLIENT_ID || !env.LINKEDIN_CLIENT_SECRET) return;

	passport.use(
		new (LinkedInStrategy as any)(
			{
				clientID: env.LINKEDIN_CLIENT_ID,
				clientSecret: env.LINKEDIN_CLIENT_SECRET,
				callbackURL: env.LINKEDIN_CALLBACK_URL || '/auth/linkedin/callback',
				scope: ['openid', 'profile', 'email'],
				passReqToCallback: true
			},
			async (req: StrategyRequest, accessToken: string, _refreshToken: string, profile: any, done: any) => {
				try {
					const linkedInEmail = normalizeEmailAddress(profile.emails?.[0]?.value);

					if (req.jwtUser) {
						const existingOtherUser = await DB_Models.UserAccount.profileModel.findOne({
							'linkedinId.linkedinId': profile.id
						});
						if (existingOtherUser && (existingOtherUser as any).id !== req.jwtUser.userId) {
							return done(null, false, { message: 'This LinkedIn account is already linked to another user' });
						}

						const user = await DB_Models.UserAccount.profileModel.findOne({ id: req.jwtUser.userId });
						if (user) {
							if (await isEmailTakenByAnotherUser(linkedInEmail, req.jwtUser.userId)) {
								return done(null, false, { message: EMAIL_ALREADY_IN_USE_MESSAGE });
							}

							const linkedAccounts = ((user as any).toObject().linkedAccounts ?? []) as string[];
							const isAlreadyLinked = linkedAccounts.some((account) => account.toLowerCase() === 'linkedin');

							if (!isAlreadyLinked) {
								await DB_Models.UserAccount.profileModel.updateOne(
									{ id: (user as any).id },
									{
										$push: { linkedAccounts: 'LinkedIn' as AccountType },
										$set: {
											linkedinId: {
												linkedinId: profile.id,
												email: profile.emails?.[0]?.value || '',
												accessToken
											}
										}
									}
								);
								const updatedUser = await DB_Models.UserAccount.profileModel.findOne({ id: (user as any).id });
								return done(null, updatedUser);
							}

							return done(null, user);
						}
					}

					let user = await DB_Models.UserAccount.profileModel.findOne({
						'linkedinId.linkedinId': profile.id
					});

					if (!user) {
						if (await isEmailTakenByAnotherUser(linkedInEmail)) {
							return done(null, false, { message: EMAIL_ALREADY_IN_USE_MESSAGE });
						}

						const newProfile: Profile = {
							id: randomUUID(),
							name: profile.displayName || 'LinkedIn User',
							email: linkedInEmail,
							profileImgURL: profile.photos?.[0]?.value || '',
							mainAccountType: 'LinkedIn' as AccountType,
							linkedinId: {
								linkedinId: profile.id,
								email: linkedInEmail || '',
								accessToken
							},
							linkedAccounts: ['LinkedIn' as AccountType],
							createdAt: new Date()
						};

						user = await DB_Models.UserAccount.profileModel.create(newProfile as any);

						try {
							await autoJoinUserToInvitedWorkspaces({
								userId: user.id,
								userObjectId: user._id,
								email: user.email
							});
						} catch (invitationReconciliationError) {
							console.error('[auth] Failed to auto-join invited workspaces after LinkedIn signup', invitationReconciliationError);
						}
					}

					return done(null, user);
				} catch (error) {
					return done(error as Error);
				}
			}
		)
	);

	configuredProviders.add('linkedin');
}

export function initPassportStrategies() {
	registerGoogleStrategy();
	registerGithubStrategy();
	registerLinkedInStrategy();

	if (!isPassportSessionSerializerRegistered) {
		passport.serializeUser((user: any, done) => {
			done(null, user.id);
		});

		passport.deserializeUser(async (id: string, done) => {
			try {
				const user = await DB_Models.UserAccount.profileModel.findOne({ id });
				done(null, user);
			} catch (error) {
				done(error as Error);
			}
		});

		isPassportSessionSerializerRegistered = true;
	}

	return passport;
}
