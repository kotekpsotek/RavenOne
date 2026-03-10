import { JWTAuth } from "./auth";
import { Fetch } from "@ravenlens/shared";

/** Call backend services with JWT attached to each request */
export function fetchAuthenticated(url: string | URL, requestInit: RequestInit, jwt?: string) {
    const token = jwt ?? JWTAuth.getToken();
    if (!token) {
        throw("Cannot make connection since JWT isn't specified");
    }

    return Fetch.universalFetchAuthenticated(url, requestInit, token);
}
