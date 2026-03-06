import { JWTAuth } from "./auth";

/** Call backend services with JWT attached to each request */
export function fetchAuthenticated(url: string | URL, requestInit: RequestInit, jwt?: string) {
    const headers = new Headers(requestInit.headers ?? {});
    if (!headers.has("Authorization")) {
        const token = jwt ?? JWTAuth.getToken();
        if (token) {
            headers.set("Authorization", `Bearer ${token}`);
        }
    }

    return fetch(url, {
        ...requestInit,
        headers,
        credentials: requestInit.credentials ?? "same-origin"
    });
}
