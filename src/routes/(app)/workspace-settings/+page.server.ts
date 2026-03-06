import type { PageServerLoad } from "./$types";
import type { LoadBackendWorkspace } from "./type";

export const load: PageServerLoad = async () => {
    return {
        workspaceLoaded: {
            id: "",
            name: "",
            imageUrl: "",
            ownerUserId: "",
            workspaceMembers: [],
            workspaceInvitements: [],
            isOwner: false,
            userPermissions: []
        }
    } satisfies LoadBackendWorkspace;
}