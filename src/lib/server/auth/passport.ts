import { randomUUID } from 'node:crypto';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as LinkedInStrategy } from 'passport-linkedin-oauth2';
import { env } from '$env/dynamic/private';
import { DB_Models } from '@ravenlens/backend';
import type { AccountType, Profile } from '@ravenlens/shared';
import type { JWTPayload } from './jwt';

export type OAuthProvider = 'google' | 'github' | 'linkedin';

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
					if (req.jwtUser) {
						const existingOtherUser = await DB_Models.UserAccount.profileModel.findOne({
							'googleAccountProperties.googleId': profile.id
						});
						if (existingOtherUser && (existingOtherUser as any).id !== req.jwtUser.userId) {
							return done(null, false, {
								message: 'This Google account is already linked to another user'
							});
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
						const newProfile: Profile = {
							id: randomUUID(),
							name: profile.displayName || 'Google User',
							email: profile.emails?.[0]?.value,
							profileImgURL: profile.photos?.[0]?.value || '',
							mainAccountType: 'Google' as AccountType,
							googleAccountProperties: {
								googleId: profile.id,
								email: profile.emails?.[0]?.value || '',
								accessToken
							},
							linkedAccounts: ['Google' as AccountType],
							createdAt: new Date()
						};

						user = await DB_Models.UserAccount.profileModel.create(newProfile as any);
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
				passReqToCallback: true
			},
			async (req: StrategyRequest, accessToken: string, _refreshToken: string, profile: any, done: any) => {
				try {
					if (req.jwtUser) {
						const existingOtherUser = await DB_Models.UserAccount.profileModel.findOne({
							'githubAccountProperties.githubUserId': parseInt(profile.id, 10)
						});
						if (existingOtherUser && (existingOtherUser as any).id !== req.jwtUser.userId) {
							return done(null, false, { message: 'This GitHub account is already linked to another user' });
						}

						const user = await DB_Models.UserAccount.profileModel.findOne({ id: req.jwtUser.userId });
						if (user) {
							const linkedAccounts = ((user as any).toObject().linkedAccounts ?? []) as string[];
							const isAlreadyLinked = linkedAccounts.some((account) => account.toLowerCase() === 'github');

							if (!isAlreadyLinked) {
								await DB_Models.UserAccount.profileModel.updateOne(
									{ id: (user as any).id },
									{
										$push: { linkedAccounts: 'Github' as AccountType },
										$set: {
											githubAccountProperties: {
												githubUserId: parseInt(profile.id, 10),
												githubUserName: profile.username,
												githubAccessToken: accessToken
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
						'githubAccountProperties.githubUserId': parseInt(profile.id, 10)
					});

					if (!user) {
						const newProfile: Profile = {
							id: randomUUID(),
							name: profile.displayName || profile.username || 'GitHub User',
							profileImgURL: profile.photos?.[0]?.value || '',
							mainAccountType: 'Github' as AccountType,
							githubAccountProperties: {
								githubUserId: parseInt(profile.id, 10),
								githubUserName: profile.username,
								githubAccessToken: accessToken
							},
							linkedAccounts: ['Github' as AccountType],
							createdAt: new Date()
						};

						user = await DB_Models.UserAccount.profileModel.create(newProfile as any);
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
					if (req.jwtUser) {
						const existingOtherUser = await DB_Models.UserAccount.profileModel.findOne({
							'linkedinId.linkedinId': profile.id
						});
						if (existingOtherUser && (existingOtherUser as any).id !== req.jwtUser.userId) {
							return done(null, false, { message: 'This LinkedIn account is already linked to another user' });
						}

						const user = await DB_Models.UserAccount.profileModel.findOne({ id: req.jwtUser.userId });
						if (user) {
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
						const newProfile: Profile = {
							id: randomUUID(),
							name: profile.displayName || 'LinkedIn User',
							email: profile.emails?.[0]?.value,
							profileImgURL: profile.photos?.[0]?.value || '',
							mainAccountType: 'LinkedIn' as AccountType,
							linkedinId: {
								linkedinId: profile.id,
								email: profile.emails?.[0]?.value || '',
								accessToken
							},
							linkedAccounts: ['LinkedIn' as AccountType],
							createdAt: new Date()
						};

						user = await DB_Models.UserAccount.profileModel.create(newProfile as any);
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
