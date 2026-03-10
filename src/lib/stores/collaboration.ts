import { get, writable } from "svelte/store";
import { Collabortation } from "@ravenlens/shared";
import { browser } from "$app/environment";
import { JWTAuth } from "$lib/utils/auth";
import { userProfile } from "./user";
import { env } from "$env/dynamic/public";

/** Is the list of collaborators from currently selected workspace */
export const workspaceCollabs = writable<Collabortation.CollabUser[]>([]);
export const fileCollaborators = (() => {
    const store = writable<(Collabortation.CollabEditor | Collabortation.CollabUser)[]>([]);

    return {
        ...store,
        /** Check is user editor by checking current collaborators of store -> doesn't make the connection to service. What differs it from `Collab` method */
        isCurrentUserEditor() {
            const storeState = get(store);
            const currentUser = get(userProfile);
            
            return storeState.some(collaborator => collaborator.id === currentUser?.id && Collabortation.isCollaboratorEditor(collaborator));
        }
    }
})();
export const collaborationInterface = (() => {
    const store = writable<Collabortation.Collab | undefined>(undefined);
    const storeSetup = {
        ...store,
        getInterface() {
            return get(store);
        }
    };

    if (browser) {
        // Preset of requirements
        const tokenJwt = JWTAuth.getToken();
        if (!tokenJwt) {
            console.error('Cannot setup collaboration interface since JWT token isn\'t specified!');
            return storeSetup;
        }
        
        const userProfileLocal = get(userProfile);
        if (!userProfileLocal) {
            console.error(`Cannot setup collaboration interface since user profile isn't specified`);
            return storeSetup;
        }

        if (!env.PUBLIC_SOCKET_IO_COLLABORATION_SERVICE_URL) {
            console.error("Cannot setup collaboration service due to: Connection env variable isn't specified");
            return storeSetup;
        }

        // Prepare collab
        const collabInstance = new Collabortation.Collab(
            tokenJwt,
            {
                id: userProfileLocal.id,
                name: userProfileLocal.name,
                mainAccountType: userProfileLocal.mainAccountType,
                createdAt: userProfileLocal.createdAt
            },
            env.PUBLIC_SOCKET_IO_COLLABORATION_SERVICE_URL
        );

        // Set collab to store
        store.set(collabInstance);
    }

    return storeSetup;
})();