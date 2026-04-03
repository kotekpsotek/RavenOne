import { stopExecutionResultsResize } from "$lib/list&tray/resize";
import { get, writable } from "svelte/store";
import { File } from "@ravenlens/shared";

export type TabsAvailable = "Tasks" | "Routines" | "Spikes";

export const tabsAvailable: TabsAvailable[] = [
    "Tasks",
    "Routines",
    "Spikes"
];

/** For `Routines` and `Spikes` */
export const showExecutionResults = writable<boolean>(false);

/** List with selected point timestamps */
export const selectedSpikeRoutineResultDateTimestamps = writable<string[]>([]);
export const selectedSpikeRoutineId = writable<string | null>(null);

/** Is a selected document for routine or spike */
export const selectedSpikeRoutineDocument = (() => {
    const selectedDocument = writable<File.RoutinesSpikes.FrontendDownloadResultObject["resultDocumentsHTML"][number] | undefined>(undefined);

    return {
        ...selectedDocument,
        onSelectDocument(document: File.RoutinesSpikes.FrontendDownloadResultObject["resultDocumentsHTML"][number]) {
            return () => {
                const currentDocument = get(selectedDocument);

                if (currentDocument?.id === document.id) {
                    selectedDocument.set(undefined);
                }
                else selectedDocument.set(document);
            }
        },
        unselect() {
            selectedDocument.set(undefined);
        }
    }
})();

export const selectedTab = (() => {
    const { ...all } = writable<TabsAvailable>("Tasks");

    return {
        ...all,
        onSelectTab(tab: TabsAvailable) {
            return (_ev: Event) => {
                if (tab === "Tasks") {
                    showExecutionResults.set(false);
                    stopExecutionResultsResize();
                }

                // Clears selected document
                selectedSpikeRoutineDocument.set(undefined);
                
                //
                all.set(tab);
            }
        }
    }
})();
