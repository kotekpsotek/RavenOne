import passport from 'passport';
import type { RequestEvent } from '@sveltejs/kit';
import type { OAuthProvider } from './passport';
import type { JWTPayload } from './jwt';

type RequestOverrides = {
	jwtUser?: JWTPayload;
};

type RedirectResult = {
	location: string;
	status: number;
};

type CallbackResult = {
	user: unknown | false;
	info?: unknown;
	status?: number;
};

type AuthenticateOptions = Record<string, unknown>;

function toRequestHeaders(event: RequestEvent): Record<string, string> {
	const headers: Record<string, string> = {};

	event.request.headers.forEach((value, key) => {
		headers[key.toLowerCase()] = value;
	});

	if (!headers.host) {
		headers.host = event.url.host;
	}

	return headers;
}

function toQueryObject(event: RequestEvent): Record<string, string> {
	const query: Record<string, string> = {};

	event.url.searchParams.forEach((value, key) => {
		if (!(key in query)) {
			query[key] = value;
		}
	});

	return query;
}

function createMockRequest(event: RequestEvent, overrides: RequestOverrides = {}) {
	const headers = toRequestHeaders(event);
	const isSecure = event.url.protocol === 'https:';

	const request = {
		method: event.request.method,
		url: `${event.url.pathname}${event.url.search}`,
		originalUrl: `${event.url.pathname}${event.url.search}`,
		path: event.url.pathname,
		headers,
		query: toQueryObject(event),
		body: {},
		connection: { encrypted: isSecure },
		socket: { encrypted: isSecure },
		protocol: isSecure ? 'https' : 'http',
		get(headerName: string) {
			return headers[headerName.toLowerCase()];
		},
		...overrides
	};

	return request;
}

function createMockResponse(onEnd: (result: RedirectResult) => void) {
	const responseHeaders = new Map<string, string>();

	const response = {
		statusCode: 200,
		setHeader(name: string, value: unknown) {
			responseHeaders.set(name.toLowerCase(), Array.isArray(value) ? value.join(',') : String(value));
		},
		getHeader(name: string) {
			return responseHeaders.get(name.toLowerCase());
		},
		writeHead(statusCode: number, headers?: Record<string, unknown>) {
			this.statusCode = statusCode;
			if (headers) {
				for (const [name, value] of Object.entries(headers)) {
					this.setHeader(name, value);
				}
			}
			return this;
		},
		end() {
			onEnd({
				location: this.getHeader('location') ?? '',
				status: this.statusCode || 302
			});
		}
	};

	return response;
}

export function beginOAuthFlow(
	event: RequestEvent,
	provider: OAuthProvider,
	options: AuthenticateOptions
): Promise<RedirectResult> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const request = createMockRequest(event);
		const response = createMockResponse((redirect) => {
			if (settled) return;
			settled = true;

			if (!redirect.location) {
				reject(new Error(`Passport did not provide redirect location for provider '${provider}'`));
				return;
			}

			resolve(redirect);
		});

		const middleware = passport.authenticate(provider, options as any);
		middleware(request as any, response as any, (error?: Error) => {
			if (settled) return;
			if (error) {
				settled = true;
				reject(error);
				return;
			}

			const location = response.getHeader('location');
			if (location) {
				settled = true;
				resolve({ location, status: response.statusCode || 302 });
				return;
			}

			settled = true;
			reject(new Error(`Passport authentication exited without redirect for provider '${provider}'`));
		});
	});
}

export function completeOAuthFlow(
	event: RequestEvent,
	provider: OAuthProvider,
	options: AuthenticateOptions,
	requestOverrides: RequestOverrides = {}
): Promise<CallbackResult> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const request = createMockRequest(event, requestOverrides);
		const response = createMockResponse(() => {
			if (settled) return;
			settled = true;
			resolve({
				user: false,
				info: { message: 'Authentication failed' },
				status: response.statusCode
			});
		});

		const middleware = passport.authenticate(
			provider,
			options as any,
			(error: Error | null, user: unknown | false, info: unknown, status?: number) => {
				if (settled) return;
				if (error) {
					settled = true;
					reject(error);
					return;
				}

				settled = true;
				resolve({ user, info, status });
			}
		);

		middleware(request as any, response as any, (error?: Error) => {
			if (settled) return;
			if (error) {
				settled = true;
				reject(error);
				return;
			}

			settled = true;
			resolve({
				user: false,
				info: { message: 'Authentication failed' },
				status: response.statusCode
			});
		});
	});
}
