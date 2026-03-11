import { get, writable, derived } from "svelte/store";
import { Collabortation } from "@ravenlens/shared";
import type { Profile } from "@ravenlens/shared";
import { browser } from "$app/environment";
import { JWTAuth } from "$lib/utils/auth";
import { userProfile } from "./user";
import { env } from "$env/dynamic/public";
import type { CollabEditor } from "../../../../../packages/shared/dist/collaboration/collab";

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

    return entry.collaborators.some(
        (collaborator) => collaborator.id === userId && Collabortation.isCollaboratorEditor(collaborator)
    );
}

function createCollaborationInterface(profile: Profile, tokenJwt: string): Collabortation.Collab {
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
    const store = writable<Collabortation.Collab | undefined>(undefined);
    const storeSetup = {
        ...store,
        getInterface() {
            return get(store);
        }
    };

    const initializeInterface = (profile: Profile | undefined, tokenJwt: string): boolean => {
        if (!profile || get(store)) {
            return false;
        }

        store.set(createCollaborationInterface(profile, tokenJwt));
        return true;
    };

    if (browser) {
        const tokenJwt = JWTAuth.getToken();
        if (!tokenJwt) {
            return storeSetup;
        }

        if (!env.PUBLIC_SOCKET_IO_COLLABORATION_SERVICE_URL) {
            console.error("Cannot setup collaboration service due to: Connection env variable isn't specified");
            return storeSetup;
        }

        if (!initializeInterface(get(userProfile), tokenJwt)) {
            const unsubscribe = userProfile.subscribe((userProfileLocal) => {
                if (!initializeInterface(userProfileLocal, tokenJwt)) {
                    return;
                }

                unsubscribe();
            });
        }
    }

    return storeSetup;
})();

/** Is the list of collaborators from currently selected workspace */
export const workspaceCollabs = writable<Collabortation.CollabUser[]>([]);

export const entriesCollaborators = (() => {
    const collabsFiles = writable<FileCollaboratorsEntry[]>([]);

    if (browser) {
        const registerEntriesCollaboratorsListeners = (interfaceCollab: NonNullable<ReturnType<typeof collaborationInterface.getInterface>>) => {
            interfaceCollab.onJoinFile((file, user) => {
                collabsFiles.update((state) => {
                    const fileEntry = state.find((candidate) => candidate.fileId === file.id);
                    if (!fileEntry) {
                        return [...state, { fileId: file.id, collaborators: [user] }];
                    }

                    if (fileEntry.collaborators.some((collaborator) => collaborator.id === user.id)) {
                        return state;
                    }

                    return state.map((entry) => {
                        if (entry.fileId !== file.id) {
                            return entry;
                        }

                        return {
                            ...entry,
                            collaborators: [...entry.collaborators, user]
                        };
                    });
                });
            });

            interfaceCollab.onLeaveFile((file, user) => {
                collabsFiles.update((state) => {
                    return state.map((entry) => {
                        if (entry.fileId !== file.id) {
                            return entry;
                        }

                        return {
                            ...entry,
                            collaborators: entry.collaborators.filter((collaborator) => collaborator.id !== user.id)
                        };
                    });
                });
            });

            interfaceCollab.onNewEditorGradeUser((file, user) => {
                collabsFiles.update((state) => {
                    return state.map((entry) => {
                        if (entry.fileId !== file.id) {
                            return entry;
                        }

                        return {
                            ...entry,
                            collaborators: entry.collaborators.map((collaborator) => {
                                if (collaborator.id === user.id) {
                                    return {
                                        ...collaborator,
                                        isEditor: true
                                    } as Collabortation.CollabEditor;
                                }

                                if (!Collabortation.isCollaboratorEditor(collaborator)) {
                                    return collaborator;
                                }

                                const { isEditor, ...collaboratorWithoutEditorGrade } = collaborator as CollabEditor;
                                return collaboratorWithoutEditorGrade as Collabortation.CollabUser;
                            })
                        };
                    });
                });
            });
        };

        queueMicrotask(() => {
            const existingInterface = collaborationInterface.getInterface();
            if (existingInterface) {
                registerEntriesCollaboratorsListeners(existingInterface);
                return;
            }

            const unsubscribe = collaborationInterface.subscribe((interfaceCollab) => {
                if (!interfaceCollab) {
                    return;
                }

                registerEntriesCollaboratorsListeners(interfaceCollab);
                unsubscribe();
            });
        });
    }

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