import {
    asNullableString,
    asNonEmptyString,
    loadWorkspaceEntries,
    moveFileEntry,
    parseJsonBody,
    persistWorkspaceEntries,
    requireWorkspaceAccess,
    type MovePosition
} from "../server-utils";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

type ChangePositionRequestBody = {
    workspaceId?: unknown;
    sourceId?: unknown;
    targetId?: unknown;
    position?: unknown;
};

function isMovePosition(candidate: unknown): candidate is MovePosition {
    return candidate === "before" || candidate === "after" || candidate === "inside";
}

export const PUT: RequestHandler = async ({ request, cookies, fetch }) => {
    const requestBody = await parseJsonBody<ChangePositionRequestBody>(request);
    if (!requestBody) {
        return json({ ok: false, message: "Invalid request body" }, { status: 400 });
    }

    const workspaceId = asNonEmptyString(requestBody.workspaceId);
    const sourceId = asNonEmptyString(requestBody.sourceId);
    const targetId = requestBody.targetId === undefined
        ? null
        : asNullableString(requestBody.targetId);

    if (!workspaceId || !sourceId) {
        return json({ ok: false, message: "workspaceId and sourceId are required" }, { status: 400 });
    }

    if (targetId === undefined) {
        return json({ ok: false, message: "targetId has to be a string or null" }, { status: 400 });
    }

    if (!isMovePosition(requestBody.position)) {
        return json({ ok: false, message: "position has to be before, after or inside" }, { status: 400 });
    }

    const access = await requireWorkspaceAccess({
        request,
        cookies,
        fetchFn: fetch,
        workspaceId,
        requireManageFiles: true
    });

    if (access instanceof Response) {
        return access;
    }

    const workspaceEntries = await loadWorkspaceEntries(workspaceId);
    const moveResult = moveFileEntry(workspaceEntries, sourceId, targetId, requestBody.position);

    if (!moveResult.moved) {
        return json({ ok: false, message: "Unable to move file with provided ids" }, { status: 404 });
    }

    await persistWorkspaceEntries(workspaceId, moveResult.entries);

    return json(
        {
            ok: true,
            moved: true,
            sourceId,
            targetId,
            position: requestBody.position
        },
        { status: 200 }
    );
};
