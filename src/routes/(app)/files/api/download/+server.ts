import {
    asNonEmptyString,
    loadWorkspaceEntries,
    parseJsonBody,
    requireWorkspaceAccess
} from "../server-utils";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

type DownloadFilesRequestBody = {
    workspaceId?: unknown;
};

export const POST: RequestHandler = async ({ request, cookies, fetch }) => {
    const requestBody = await parseJsonBody<DownloadFilesRequestBody>(request);
    if (!requestBody) {
        return json({ ok: false, message: "Invalid request body" }, { status: 400 });
    }

    const workspaceId = asNonEmptyString(requestBody.workspaceId);
    if (!workspaceId) {
        return json({ ok: false, message: "workspaceId is required" }, { status: 400 });
    }

    const access = await requireWorkspaceAccess({
        request,
        cookies,
        fetchFn: fetch,
        workspaceId
    });

    if (access instanceof Response) {
        return access;
    }

    const files = await loadWorkspaceEntries(workspaceId);

    return json(
        {
            ok: true,
            files
        },
        { status: 200 }
    );
};
