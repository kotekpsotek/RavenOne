import { stopExecutionResultsResize } from "$lib/list&tray/resize";
import { writable } from "svelte/store";

export type TabsAvailable = "Tasks" | "Routines" | "Spikes";

export const tabsAvailable: TabsAvailable[] = [
    "Tasks",
    "Routines",
    "Spikes"
];

export const showExecutionResults = writable<boolean>(false);

/** List with selected point timestamps */
export const selectedSpikeRoutineResultDateTimestamps = writable<string[]>([]);
export const selectedSpikeRoutineId = writable<string | null>(null);

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

                all.set(tab);
            }
        }
    }
})();
