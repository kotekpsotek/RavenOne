import {
    asNonEmptyString,
    loadWorkspaceEntries,
    parseJsonBody,
    requireWorkspaceAccess
} from "../../server-utils";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "../$types";
import { DB_Models } from "@ravenlens/backend";
import { fileMap } from "$lib/utils/files";

interface DownloadFileRequestBody {
    workspaceId: string;
    fileId: string;
};

export const POST: RequestHandler = async ({ request, cookies, fetch }) => {
    const requestBody = await parseJsonBody<DownloadFileRequestBody>(request);
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
    const filesOneScope = files.flatMap(fileMap)
    const doesExistsFile = filesOneScope.find(file => file.id === requestBody.fileId);

    //
    if (!doesExistsFile) {
        return new Response(null, { status: 404 });
    }

    //
    return json(
        {
            ok: true,
            file: doesExistsFile
        },
        { status: 200 }
    );
};
