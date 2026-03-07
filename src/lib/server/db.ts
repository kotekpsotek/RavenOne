import { DB_Models } from "@ravenlens/backend";
import type { Profile } from "@ravenlens/shared";

export async function prefetchWorkspaceWithMembers(workspaceId: string) {
    const userWorkspacesQuota = await DB_Models.Workspace.Workspace.workspaceModel.findOne({
        id: workspaceId
    })
    .populate("workspaceMembers.user") as any as (Omit<DB_Models.Workspace.Workspace.WorkspaeFetchedDB, "workspaceMembers"> & ({ workspaceMembers: (Omit<DB_Models.Workspace.Workspace.MemberWorkspaceDB, "user"> & { user: Profile })[] }));

    return userWorkspacesQuota;
}
