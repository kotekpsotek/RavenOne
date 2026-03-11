import { browser } from "$app/environment";
import { alertState } from "$lib/utils/alert";
import { downloadCurrentUser, isUserAuthenticated, JWTAuth } from "$lib/utils/auth";
import { error, redirect } from "@sveltejs/kit";
import type { LayoutLoad } from "./$types";
import { userProfile } from "$lib/stores/user";
import { get } from "svelte/store";
import { collaborationInterface } from "$lib/stores/collaboration";
import { entriesCollaborators } from "$lib/stores/collaboration";
import { Collabortation, File } from "@ravenlens/shared";
import { entriesList, moveEntry, patchFileById } from "$lib/stores/files";
import { workspaceCollabs } from "$lib/stores/collaboration";
import { selectedWorkspace } from "$lib/stores/workspace";

function setUnauthenticatedAlert(pathname: string) {
    alertState.set({
        alert: {
            type: "warning",
            name: "You've to be logged in",
            description: "You've to be logged in to access page: " + pathname
        },
        timeoutMs: 10_000
    });
}

export const load: LayoutLoad = async ({ url }) => {
    if (browser) {
        const token = JWTAuth.getToken();
        if (!token) {
            setUnauthenticatedAlert(url.pathname);
            throw redirect(307, "/auth/login");
        }

        const isUserAuthenticatedLocal = await isUserAuthenticated(token);
        if (!isUserAuthenticatedLocal) {
            setUnauthenticatedAlert(url.pathname);
            throw redirect(307, "/auth/login");
        }

        // Download the real user
        const userDownloaded = await downloadCurrentUser(token, url.origin);
        if (userDownloaded.data) {
            userProfile.set(userDownloaded.data.user);
        }
        else {
            JWTAuth.deleteToken();
            return error(500, "Cannot load your profile");
        }

        // Collabortation events listening
        const interfaceCollab = collaborationInterface.getInterface();
        
        /// ... Workspace
        /** Helps to 'ingore members are joining to differnet workspace then selected' */
        function isSelectedWorkspaceEvent(workspaceId: string) {
            const selectedWorkspaceState = get(selectedWorkspace);
            return Boolean(selectedWorkspaceState && selectedWorkspaceState.id === workspaceId);
        }
        
        interfaceCollab?.onJoinWorkspace((workspaceId, user) => {
            if (!isSelectedWorkspaceEvent(workspaceId)) {
                return;
            }
            console.log('User joining workspace👌🚀', workspaceId, user);

            workspaceCollabs.update((collaborators) => {
                if (collaborators.some((collaborator) => collaborator.id === user.id)) {
                    return collaborators;
                }

                return [...collaborators, user];
            });
        });

        interfaceCollab?.onLeaveWorkspace((workspaceId, user) => {
            if (!isSelectedWorkspaceEvent(workspaceId)) {
                return;
            }
            console.log('User leaving workspace👌🚀', workspaceId, user);

            workspaceCollabs.update((collaborators) =>
                collaborators.filter((collaborator) => collaborator.id !== user.id)
            );
        });
        
        /// ... Files
        interfaceCollab?.onJoinFile((file, user) => {
            entriesCollaborators.update((state) => {
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

        interfaceCollab?.onLeaveFile((file, user) => {
            entriesCollaborators.update((state) => {
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

        interfaceCollab?.onNewEditorGradeUser((file, user) => {
            entriesCollaborators.update((state) => {
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

                            const { isEditor, ...collaboratorWithoutEditorGrade } = collaborator as Collabortation.CollabEditor;
                            return collaboratorWithoutEditorGrade as Collabortation.CollabUser;
                        })
                    };
                });
            });
        });

        /// ... Files
        interfaceCollab?.onNewFile((file) => {
            entriesList.update(entries => [...entries, file]);
        });

        interfaceCollab?.onRemovedFile((file) => {
            entriesList.update(entries => {
                const removeById = (items: File.File.File[]): File.File.File[] => {
                    return items
                        .filter(item => item.id !== file.id)
                        .map(item => ({
                            ...item,
                            subentries: item.subentries ? removeById(item.subentries) : undefined
                        }));
                };
                return removeById(entries);
            });
        });

        interfaceCollab?.onRelocatedFile((file, target, relocatedByUser) => {
            moveEntry(file.id, target.id, "inside");
        });

        interfaceCollab?.onRenamedFile((file, renambedByUser, newName) => {
            patchFileById(file.id, {
                ...file,
                name: newName
            });
        });

        interfaceCollab?.onWalperChangedFile((file, wallpaperUrl) => {
            patchFileById(file.id, {
                ...file,
                walper: wallpaperUrl ?? undefined
            });
        });

        interfaceCollab?.onIconChangedFile((file, icon) => {
            patchFileById(file.id, {
                ...file,
                icon: icon ?? undefined
            });
        });

        interfaceCollab?.onFileChanged((file) => {
            patchFileById(file.id, file, {
                queueUnsaved: false,
                emitFileChanged: false
            });
        });
    }
}
