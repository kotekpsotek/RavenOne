import { get, writable, derived } from "svelte/store";
import { Collabortation } from "@ravenlens/shared";
import { browser } from "$app/environment";
import { JWTAuth } from "$lib/utils/auth";
import { userProfile } from "./user";
import { selectedFile } from "./files";
import { env } from "$env/dynamic/public";
import type { CollabEditor } from "../../../../../packages/shared/dist/collaboration/collab";

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
/** Is the list of collaborators from currently selected workspace */
export const workspaceCollabs = writable<Collabortation.CollabUser[]>([]);
export const entriesCollaborators = (() => {
    const collabsFiles = writable<{
        fileId: string;
        collaborators: (Collabortation.CollabEditor | Collabortation.CollabUser)[];
    }[]>([]);

    if (browser) {
        const interfaceCollab = collaborationInterface.getInterface();

        interfaceCollab?.onJoinFile((file, user) => {
            collabsFiles.update(state => {
                const fileEntry = state.find(e => e.fileId === file.id);
                if (!fileEntry) {
                    return [...state, { fileId: file.id, collaborators: [user] }];
                }
                if (fileEntry.collaborators.some(c => c.id === user.id)) {
                    return state;
                }
                return state.map(e => e.fileId === file.id 
                    ? { ...e, collaborators: [...e.collaborators, user] } 
                    : e
                );
            });
        });

        interfaceCollab?.onLeaveFile((file, user) => {
            collabsFiles.update(state => state.map(e => e.fileId === file.id 
                ? { ...e, collaborators: e.collaborators.filter(c => c.id !== user.id) } 
                : e
            ));
        });

        interfaceCollab?.onNewEditorGradeUser((file, user) => {
            // Remove the existsing collaborator from file
            collabsFiles.update(state => {
                return state.map(fileLocal => {
                    // Setup the user gets the editor grade to editors list
                    if (file.id === fileLocal.fileId) {
                        fileLocal.collaborators = fileLocal.collaborators.map(collab => {
                            if (collab.id === user.id) {
                                (collab as CollabEditor).isEditor = true;
                            }
                            else if (Collabortation.isCollaboratorEditor(collab)) {
                                delete (collab as any).isEditor;
                            }

                            
                            return collab;
                        });
                    }

                    return fileLocal
                });
            });
        });
    }

    return collabsFiles;
})();
export const fileCollaborators = (() => {
    const store = derived(
        [entriesCollaborators, selectedFile],
        ([$entriesCollaborators, $selectedFile]) => {
            if (!$selectedFile || !$entriesCollaborators) {
                return [];
            }

            const entry = $entriesCollaborators.find(e => e.fileId === $selectedFile.id);
            return entry ? entry.collaborators : [];
        }
    );

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