import { PUBLIC_AUTH_ENDPOINT } from "$env/static/public";
import { alertState } from './alert';
import type { AccountType, Profile, SubscriptionResponseCustomer } from "@ravenlens/shared";
import { fetchAuthenticated } from "./fetch";
import { browser } from "$app/environment";
import { goto } from "$app/navigation";

/** Call to authentication route */
export function onAuthenticateWith(provider: "github" | "google" | "linkedin", mode: "signin" | "signup") {
    return async () => {
        const uri = `/auth/${provider}`;
        window.location.href = uri;
    }
}

export class JWTAuth {
    static setToken(token: string) {
        localStorage.setItem('jwt', token);
        if (browser) {
            document.cookie = `jwt=${encodeURIComponent(token)}; Path=/; SameSite=Strict; Max-Age=${60 * 60 * 24 * 7}`;
        }
    }

    static getToken() {
        if (!browser) return null;

        const tokenFromStorage = localStorage.getItem('jwt');
        if (tokenFromStorage) return tokenFromStorage;

        const tokenFromCookie = document.cookie
            .split('; ')
            .find((row) => row.startsWith('jwt='))
            ?.slice(4);

        if (!tokenFromCookie) return null;

        const decodedToken = decodeURIComponent(tokenFromCookie);
        localStorage.setItem('jwt', decodedToken);
        return decodedToken;
    }

    static deleteToken() {
        localStorage.removeItem("jwt");
        if (browser) {
            document.cookie = "jwt=; Path=/; Max-Age=0";
        }
    }
}

export interface AuthBody {
    message: string;
    token: string;
    user: {
        id: string;
        email: string;
        name: string;
        mainAccountType: AccountType;
    }
}

/** Make request to check is user authenticated */
export async function isUserAuthenticated(jwt?: string): Promise<boolean> {
    if (!browser && !jwt) {
        throw("JWT is required to be specified as parameter for server running auth function");
    }
    
    const response = await fetchAuthenticated(`${PUBLIC_AUTH_ENDPOINT}/auth/is-authenticated`, {
        method: "GET"
    }, jwt);

    return response.ok;
}

/** Make request to download user from api service */
export async function downloadCurrentUser(jwt?: string): Promise<{ status: boolean, data?: { user: Profile } }> {
    if (!browser && !jwt) {
        throw("JWT is required to be specified as parameter for server running auth function");
    }
    
    const response = await fetchAuthenticated(`${PUBLIC_AUTH_ENDPOINT}/auth/me`, {
        method: "GET"
    }, jwt);

    if (response.ok) {
        const responseBody = await response.json() as { user: Profile };

        return { status: true, data: responseBody };
    }
    else return { status: false };
}

/**
 * For both signin and singup action for email auth method
 */
export async function handleEmailActionResponse(response: Response) {
    // 201 for signup / 200 for login
    if (response.status === 200 || response.status === 201) {
      const responseBody = await response.json() as AuthBody;

      // Collect jwt to storage
      JWTAuth.setToken(responseBody.token);
      
      // Navigate
      await goto('/');
    }
    else {
        // Show alert using the global alert store so Alert.svelte displays it
        let errMsg = 'Authentication failed. Please try again.';
        try {
            const body = await response.json();
            if (body && body.message) errMsg = String(body.message);
            else errMsg = JSON.stringify(body) || errMsg;
        } catch (e) {
            try {
                const text = await response.text();
                if (text) errMsg = text;
            } catch (e) {
                // ignore
            }
        }

        alertState.set({
            alert: {
                name: 'Authentication Error',
                description: errMsg,
                icon: 'heroicons:exclamation-circle',
                type: 'error',
                classStyle: 'alert-error'
            },
            timeoutMs: 5000
        });
    }
}
