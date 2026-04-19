import { get, writable, derived } from "svelte/store";
import { Collabortation, type Profile } from "$lib/sharedCompat";
import { browser } from "$app/environment";
import { JWTAuth } from "$lib/utils/auth";
import { userProfile, waitTillProfileLoaded } from "./user";
import { env } from "$env/dynamic/public";

type FileCollaborator = Collabortation.CollabEditor | Collabortation.CollabUser;
type FileCollaboratorsEntry = {
    fileId: string;
    collaborators: FileCollaborator[];
};

const selectedFileId = writable<string | undefined>(undefined);

export function setSelectedFileIdInCollaboration(fileId: string | undefined): void {
    selectedFileId.set(fileId);
}

export function isUserEditorForFile(
    entries: FileCollaboratorsEntry[],
    fileId: string | null | undefined,
    userId: string | null | undefined
): boolean {
    if (!fileId || !userId) {
        return false;
    }

    const entry = entries.find((candidate) => candidate.fileId === fileId);
    if (!entry) {
        return false;
    }

    const isExplicitEditor = entry.collaborators.some(
        (collaborator) => collaborator.id === userId && Collabortation.isCollaboratorEditor(collaborator)
    );

    if (isExplicitEditor) {
        return true;
    }

    const hasAnyExplicitEditor = entry.collaborators.some((collaborator) => {
        return Collabortation.isCollaboratorEditor(collaborator);
    });

    if (hasAnyExplicitEditor) {
        return false;
    }

    // Fallback for payloads without editor grade: treat current collaborator as editor.
    return entry.collaborators.some((collaborator) => collaborator.id === userId);
}

function createCollaborationInterface(profile: Profile, tokenJwt: string): InstanceType<typeof Collabortation.Collab> {
    return new Collabortation.Collab(
        tokenJwt,
        {
            id: profile.id,
            name: profile.name,
            mainAccountType: profile.mainAccountType,
            createdAt: profile.createdAt
        },
        env.PUBLIC_SOCKET_IO_COLLABORATION_SERVICE_URL
    );
}

export const collaborationInterface = (() => {
    const store = writable<InstanceType<typeof Collabortation.Collab> | undefined>(undefined);

    const initializeInterface = (profile: Profile | undefined): boolean => {
        const tokenJwt = JWTAuth.getToken();
        if (!tokenJwt) {
            console.error("Token JWT doesn't exist");
            return false;
        }

        if (!profile || get(store)) {
            return false;
        }

        store.set(createCollaborationInterface(profile, tokenJwt));
        return true;
    };

    const storeSetup = {
        ...store,
        getInterface() {
            let interfaceCollab = get(store);
            if (!interfaceCollab) {
                const profile = get(userProfile);
                if (!profile) {
                    console.error("Cannot initialize interface since user-profile is undefined");
                }
                
                const initTry = initializeInterface(profile);
                if (!initTry) {
                    throw("Cannot initialize collaboration service interface");
                }

                interfaceCollab = get(store);
            }

            return interfaceCollab;
        }
    };

    if (browser) {
        if (!env.PUBLIC_SOCKET_IO_COLLABORATION_SERVICE_URL) {
            console.error("Cannot setup collaboration service due to: Connection env variable isn't specified");
            return storeSetup;
        }

        // Assure collab will always be initialized
        const collab = get(storeSetup);
        if (!collab) {
            const profile = get(userProfile);
            if (!profile) {
                waitTillProfileLoaded(100).then(filled => {
                    if (filled) {
                        storeSetup.getInterface();
                    }
                });
            }
            else storeSetup.getInterface();
        }
    }

    return {
        ...storeSetup,
        initializeInterface
    };
})();

/** Is the list of collaborators from currently selected workspace */
export const workspaceCollabs = writable<Collabortation.CollabUser[]>([]);

export const entriesCollaborators = (() => {
    const collabsFiles = writable<FileCollaboratorsEntry[]>([]);

    return {
        ...collabsFiles,
        isCurrentUserEditor(fileId: string | null | undefined) {
            const currentUser = get(userProfile);
            return isUserEditorForFile(get(collabsFiles), fileId, currentUser?.id);
        }
    };
})();

export const isCurrentUserSelectedFileEditor = derived(
    [selectedFileId, entriesCollaborators, userProfile],
    ([$selectedFileId, $entriesCollaborators, $userProfile]) => {
        return isUserEditorForFile($entriesCollaborators, $selectedFileId, $userProfile?.id);
    }
);

export const fileCollaborators = (() => {
    const store = derived(
        [entriesCollaborators, selectedFileId],
        ([$entriesCollaborators, $selectedFileId]) => {
            if (!$selectedFileId || !$entriesCollaborators) {
                return [];
            }

            const entry = $entriesCollaborators.find((candidate) => candidate.fileId === $selectedFileId);
            return entry ? entry.collaborators : [];
        }
    );

    return {
        ...store,
        /** Check is user editor by checking current collaborators of store -> doesn't make the connection to service. What differs it from `Collab` method */
        isCurrentUserEditor() {
            const currentUser = get(userProfile);
            const selectedFileIdLocal = get(selectedFileId);

            return isUserEditorForFile(get(entriesCollaborators), selectedFileIdLocal, currentUser?.id);
        }
    };
})();

export const onHandleLeaveFile: Collabortation.SuccessCallback = (success: boolean) => {
    if (!success) {
        console.error(`Cannot leave file`);
    }
}

export const onHandleJoinFile: Collabortation.CollabsCallback = (success: boolean, collabs: Collabortation.PossibleCollabsList, fileId: string | undefined) => {
    if (!success) {
        console.error(`Cannot join file`);
        return [];
    }

    // Download the file collaborators and setups as the collaborators of current file
    if (fileId) {
        entriesCollaborators.update(entriesCollabs => {
            const existingEntryIndex = entriesCollabs.findIndex((entry) => entry.fileId === fileId);

            if (existingEntryIndex < 0) {
                return [
                    ...entriesCollabs,
                    {
                        fileId,
                        collaborators: collabs,
                    }
                ];
            }

            return entriesCollabs.map((collabOfEntry) => {
                if (collabOfEntry.fileId !== fileId) {
                    return collabOfEntry;
                }

                return {
                    ...collabOfEntry,
                    collaborators: collabs
                };
            });
        })
    }
    
    return collabs;
}
