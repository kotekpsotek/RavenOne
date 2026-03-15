import { getAndValidateAuthenticated } from "$lib/server/auth/request";
import type { RequestHandler } from "@sveltejs/kit";

/**
 * Check:
 * 1. Is user logged-in
 * 2. Has user permission to download
 * 3. Check is server configured
 * 4. Check is server online
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
    const isAuth = await getAndValidateAuthenticated(request, cookies);
    if (isAuth instanceof Response) {
        return isAuth
    }
}
