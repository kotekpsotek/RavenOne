import { get, writable } from "svelte/store";
import { Collabortation } from "@ravenlens/shared";
import { browser } from "$app/environment";
import { JWTAuth } from "$lib/utils/auth";
import { userProfile } from "./user";
import { env } from "$env/dynamic/public";

export const fileCollaborators = writable<(Collabortation.CollabEditor | Collabortation.CollabUser)[]>([
    {
        id: '1',
        name: 'Collab 1',
        profileImgURL: "",
    },
    {
        id: '2',
        name: 'Collab 2',
        profileImgURL: ""
    },
    {
        id: '3',
        name: 'Collab 3',
        profileImgURL: "",
        isEditor: true,
    },
]);
export const collaborationInterface = (() => {
    const store = writable<Collabortation.Collab | undefined>(undefined);

    if (browser) {
        // Preset of requirements
        const tokenJwt = JWTAuth.getToken();
        if (!tokenJwt) {
            console.error('Cannot setup collaboration interface since JWT token isn\'t specified!');
            return store;
        }
        
        const userProfileLocal = get(userProfile);
        if (!userProfileLocal) {
            console.error(`Cannot setup collaboration interface since user profile isn't specified`);
            return store;
        }

        if (!env.PUBLIC_SOCKET_IO_COLLABORATION_SERVICE_URL) {
            console.error("Cannot setup collaboration service due to: Connection env variable isn't specified");
            return store;
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

    return store;
})();