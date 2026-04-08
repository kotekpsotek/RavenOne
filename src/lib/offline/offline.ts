import { browser } from "$app/environment";
import { entriesList, selectedFile } from "$lib/stores/files";
import { File } from "@ravenlens/shared";
import _ from "lodash";
import { get, writable } from "svelte/store";
import {
    initializeConnectivityWatcher,
    isConnectivityOnlineSnapshot,
    refreshConnectivityStatus,
} from "./connectivity";
import { fetchTheFreshestFile } from "../utils/fetch";

/** Shows decision banner when user has unsaved local content and when the freshest content from server is different -> USer has to be fille collborator to save the file */
export const onlineOfflineContentHandler = (() => {
    initializeConnectivityWatcher();

    const storeFiles = new Map<string, File.File.File>();
    const SAVE_KEY = "online-offline:filesSaved";

    const isSameFileContent = (left: File.File.File, right: File.File.File) => {
        return left.content === right.content
            && _.isEqual(left.lists, right.lists)
            && left.name === right.name
            && left.walper === right.walper
            && left.icon === right.icon;
    };

    const persistStoreFiles = () => {
        if (!browser) {
            return;
        }

        localStorage.setItem(SAVE_KEY, JSON.stringify(Array.from(storeFiles.entries())));
    };

    const fileDecisionStore = (() => {
        const store = writable<{
            isOpen: boolean;
            /** Use this file for comparision */
            fileSaved: File.File.File;
            /** Shows the freshest selected file */
            theFreshestFile: File.File.File;
        } | undefined>(undefined);

        return {
            ...store,
            /** Stups user edition file as the actual file */
            async accept() {
                // 0.5 Get the selected file
                const selectedFileLocal = get(store);
                if (!selectedFileLocal || !selectedFileLocal.fileSaved) {
                    console.warn(`File isn't selected!`);
                    return;
                }
                
                // 1.1 Saves the freshest selected file
                const canReachNetwork = await refreshConnectivityStatus({ forceProbe: true });
                if (canReachNetwork) {
                    await selectedFile.requestSave(selectedFileLocal.fileSaved, true, {
                        showFailureAlert: false,
                    });
                }

                // 1.2 Setups the selected file as local-selected file
                selectedFile.set(selectedFileLocal.fileSaved);
                // 1.5. Sets the freshest file content as entry
                entriesList.overwriteFile(selectedFileLocal.fileSaved);

                // 2. Delete the file from store
                storeFiles.delete(selectedFileLocal.fileSaved.id);
                persistStoreFiles();

                // 3. Resets store
                this.close();
            },
            /** Declines the user edition but saves and setups the freshest selected file */
            async decline() {
                // 0.5 Get the selected file
                const selectedFileLocal = get(store);
                if (!selectedFileLocal || !selectedFileLocal.fileSaved) {
                    console.warn(`File isn't selected!`);
                    return;
                }
                
                // 1.1 Saves the freshest selected file
                const canReachNetwork = await refreshConnectivityStatus({ forceProbe: true });
                if (canReachNetwork) {
                    await selectedFile.requestSave(selectedFileLocal.theFreshestFile, true, {
                        showFailureAlert: false,
                    });
                }

                // 1.2 Setups the selected file as local-selected file
                selectedFile.set(selectedFileLocal.theFreshestFile);
                // 1.5. Sets the freshest file content as entry
                entriesList.overwriteFile(selectedFileLocal.theFreshestFile);
                
                // 2. Delete the file from store
                storeFiles.delete(selectedFileLocal.fileSaved.id);
                persistStoreFiles();

                // 3. Resets store
                this.close();
            },
            close() {
                // 1. Resets store
                store.set(undefined);

                //
                const selectedFileLocal = get(store);
                if (selectedFileLocal) {
                    storeFiles.delete(selectedFileLocal.fileSaved.id);
                }
            }
        }
    })();

    // Fills the localStorage with the specified items
    if (browser) {
        // Saves the file locally
        const filesSavedLocal = localStorage.getItem(SAVE_KEY);

        if (filesSavedLocal) {
            try {
                const filesSaved = JSON.parse(filesSavedLocal) as unknown;
                if (Array.isArray(filesSaved)) {
                    for (const [fileKey, fileContent] of filesSaved as [string, File.File.File][]) {
                        if (typeof fileKey !== "string" || !fileContent?.id) {
                            continue;
                        }

                        storeFiles.set(fileKey, fileContent);
                    }
                }
            } catch (err) {
                console.warn("Cannot parse offline saved files from localStorage", err);
                localStorage.removeItem(SAVE_KEY);
            }
        }

        // Handle Leave event from browser to save the storeFiles files to the localStorage
        window.addEventListener("pagehide", persistStoreFiles);
    }
    
    return {
        fileDecisionStore,
        /** Triggered once user opens file */
        async handleOpenFile(selectedFileToOpen: File.File.File) {
            if (!browser) return;
            if (!selectedFileToOpen.id) return;
            if (get(selectedFile)?.id !== selectedFileToOpen.id) return;

            // 1. Check has the store this file saved
            if (!storeFiles.has(selectedFileToOpen.id)) {
                return;
            }

            // 2. Loads the selected file from store
            const fileSaved = storeFiles.get(selectedFileToOpen.id)!;

            // 2.5 Show the locally saved offline version immediately.
            selectedFile.set(fileSaved);
            entriesList.overwriteFile(fileSaved);

            // 3. Loads the freshest file version from store
            const canReachNetwork = await refreshConnectivityStatus({ forceProbe: true });
            const fetchedFreshestFile = canReachNetwork
                ? await fetchTheFreshestFile(selectedFileToOpen)
                : false;

            // Selection may have changed while awaiting network probe/fetch.
            if (get(selectedFile)?.id !== selectedFileToOpen.id) {
                return;
            }

            const theFreshestFile = fetchedFreshestFile || selectedFileToOpen;

            // If there is no divergence anymore, clear offline backup.
            if (isSameFileContent(fileSaved, theFreshestFile)) {
                storeFiles.delete(selectedFileToOpen.id);
                persistStoreFiles();
                fileDecisionStore.close();
                return;
            }
            
            // 4. Opens the preview store
            fileDecisionStore.set({
                isOpen: true,
                theFreshestFile: theFreshestFile,
                fileSaved
            });
        },
        /** Triggered once user leaves file */
        async handleLeaveSelectedFile(fileFromBeforeChanges: File.File.File, selectedFileSnapshot?: File.File.File) {
            const selectedFileHere = selectedFileSnapshot ?? get(selectedFile);

            if (!selectedFileHere) return;
            if (!browser) return;
            const canReachNetwork = await refreshConnectivityStatus({ forceProbe: true });
            if (canReachNetwork || isConnectivityOnlineSnapshot()) return;
            if (!selectedFileHere.id) return;
            
            // 1. Checks was the changes commited in the selected file according to the version from before changes
            if (isSameFileContent(fileFromBeforeChanges, selectedFileHere)) {
                return;
            }
            
            // 2. Fills the storeFiles with this file
            storeFiles.set(selectedFileHere.id, _.cloneDeep(selectedFileHere));
            persistStoreFiles();
        }
    }
})();

