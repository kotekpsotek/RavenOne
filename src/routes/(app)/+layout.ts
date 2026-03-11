import { browser } from "$app/environment";
import { alertState } from "$lib/utils/alert";
import { downloadCurrentUser, isUserAuthenticated, JWTAuth } from "$lib/utils/auth";
import { error, redirect } from "@sveltejs/kit";
import type { LayoutLoad } from "./$types";
import { userProfile } from "$lib/stores/user";

function setUnauthenticatedAlert(pathname: string) {
    alertState.set({
        alert: {
            type: "warning",
            name: "You've to be logged in",
            description: "You've to be logged in to access page: " + pathname
        },
        timeoutMs: 10_000
    });
}

export const load: LayoutLoad = async ({ url }) => {
    if (browser) {
        const token = JWTAuth.getToken();
        if (!token) {
            setUnauthenticatedAlert(url.pathname);
            throw redirect(307, "/auth/login");
        }

        const isUserAuthenticatedLocal = await isUserAuthenticated(token);
        if (!isUserAuthenticatedLocal) {
            setUnauthenticatedAlert(url.pathname);
            throw redirect(307, "/auth/login");
        }

        // Download the real user
        const userDownloaded = await downloadCurrentUser(token, url.origin);
        if (userDownloaded.data) {
            userProfile.set(userDownloaded.data.user);
        }
        else {
            JWTAuth.deleteToken();
            return error(500, "Cannot load your profile");
        }
    }
}
