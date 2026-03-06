import jwt from 'jsonwebtoken';
import { env } from '$env/dynamic/private';

export interface JWTPayload {
	userId: string;
	email?: string;
	name: string;
}

function getJwtSecret(): string {
	const jwtSecret = env.JWT_SECRET;
	if (!jwtSecret) {
		throw new Error('JWT_SECRET environment variable is required');
	}

	return jwtSecret;
}

export const generateToken = (payload: JWTPayload): string => {
	const jwtSecret = getJwtSecret();
	const expiresIn = env.JWT_EXPIRES_IN ?? '7d';
	return jwt.sign(payload, jwtSecret, {
		expiresIn: expiresIn as jwt.SignOptions['expiresIn']
	});
};

export const verifyToken = (token: string): JWTPayload | null => {
	const jwtSecret = getJwtSecret();

	try {
		return jwt.verify(token, jwtSecret) as JWTPayload;
	} catch {
		return null;
	}
};
