import { get, writable } from "svelte/store";
import { Workspace } from "@ravenlens/shared";
import { user } from "./user";
import type { ComponentProps } from "svelte";
import type { UI } from "@ravenlens/frontend";
import { browser } from "$app/environment";

export const selectedWorkspace = (() => {
    const STORAGE_KEY = 'selected_workspace';
    const { subscribe, set, update } = writable<Workspace.Workspace.WorkspaceUserEntryLoaded | undefined>(undefined);

    // Load from localStorage if in browser
    if (browser) {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                set(JSON.parse(stored));
            } catch (e) {
                console.error("Failed to parse selected workspace from localStorage", e);
            }
        }
    }

    return {
        subscribe,
        set: (value: Workspace.Workspace.WorkspaceUserEntryLoaded | undefined) => {
            if (browser) {
                if (value) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
                } else {
                    localStorage.removeItem(STORAGE_KEY);
                }
            }
            set(value);
        },
        update
    };
})();
// TODO: Once user subscription data is loaded this should be filled
export const avaiableWorkspaces = writable<Workspace.Workspace.WorkspaceUserEntryLoaded[]>([
    {
        id: "ws-1",
        name: "RavenOne Development",
        imageUrl: "https://github.com/ravenlens.png",
        ownerUserId: "user-1",
        isOwner: true,
        userPermissions: ["edit_prompts", "delete_prompts", "manage_lens_entities", "manage_workspace_members"]
    },
    {
        id: "ws-2",
        name: "Design Team",
        imageUrl: "https://api.dicebear.com/7.x/initials/svg?seed=DT",
        ownerUserId: "user-2",
        isOwner: false,
        userPermissions: ["edit_prompts"]
    },
    {
        id: "ws-3",
        name: "Marketing Assets",
        imageUrl: "https://api.dicebear.com/7.x/initials/svg?seed=MA",
        ownerUserId: "user-3",
        isOwner: false,
        userPermissions: ["edit_prompts", "manage_lens_entities"]
    }
]);
export const isWorkspaceSelectionOpen = writable<boolean>(false);
export const isWorkspaceInAddition = writable<boolean>(false);

/**
 * Checks whether user can add another workspace to workspaces list
*/
export function isAddNewWorkspaceBtnDisabled(): ComponentProps<UI.Workspace.WorkspaceTray>["newWorkspaceButtonDisabled"] {
    const userState = get(user);

    // TODO: Make the real check base on stores we've -> user has to have the subscription to do it

    return false;
}
