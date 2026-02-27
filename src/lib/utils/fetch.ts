import { JWTAuth } from "./auth";

/** Call backend services with JWT attached to each request */
export function fetchAuthenticated(url: string | URL, requestInit: RequestInit, jwt?: string) {
    if (!requestInit.headers) requestInit.headers = {};
    if (!(requestInit.headers as any)["Authorization"])  {
        const token = jwt ?? JWTAuth.getToken();

        if (!token) throw new Error("Cannot authenticate user since JWT is absent");
        
        (requestInit.headers as any)["Authorization"] = `Bearer ${token}`;
    }
    
    return fetch(url, requestInit);
}
