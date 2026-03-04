<script lang="ts">
    import Icon from "@iconify/svelte";
    import { selectedFile, type SpawnedList } from "$lib/stores/files";
    import { onMount } from "svelte";
    import { CancelPointEvent, playableDocumentsAndListsWithPoints, PlayEvent, StopPlayEvent } from "$lib/stores/playModeStore";
    import { isPointSuccessorOfPoint } from "../utils";

    let { itemId, spawnedList }: { itemId: string, spawnedList: SpawnedList } = $props();

    let wasPlaying = $state<null | { finishReason: "finished" | "stoped" }>(null);
    let wasPlayingTimeout: ReturnType<typeof setTimeout> | null = null;
    
    const isPointActivellyPlaying = $derived.by(() => {
        $playableDocumentsAndListsWithPoints;

        if (!$selectedFile) {
            return false;
        }

        const isActivellyPlaying = playableDocumentsAndListsWithPoints.isPointActivelyPlaying($selectedFile, spawnedList.id, itemId);

        return typeof isActivellyPlaying === "boolean" ? isActivellyPlaying : false;
    });

    const isPointPlanned = $derived.by(() => {
        $playableDocumentsAndListsWithPoints;

        if (!$selectedFile || isPointActivellyPlaying || wasPlaying) {
            return false;
        }

        if (playableDocumentsAndListsWithPoints.isPointParentPlaying($selectedFile, spawnedList.id, itemId)) {
            return true;
        }

        if (spawnedList.kind !== "ordered") {
            return false;
        }

        return playableDocumentsAndListsWithPoints.isSomePointPlayingInThisList($selectedFile, spawnedList.id);
    });

    function useTimeCounter(element: HTMLDivElement) {
        const interval = 100;
        
        let timeoutMs = 0;
        const intervalId = setInterval(() => {
            timeoutMs += interval;

            if (timeoutMs < 1_000) {
                element.textContent = `${timeoutMs}ms`     
            }
            else if (timeoutMs < 60_000) {
                element.textContent = `${Math.floor(timeoutMs / 1000)}s`
            }
            else if (timeoutMs < 3_600_000) {
                const minutes = Math.floor(timeoutMs / 60_000);
                const seconds = Math.floor((timeoutMs % 60_000) / 1000);

                element.textContent = `${minutes}m ${seconds}s`;
            }
            else {
                const hours = Math.floor(timeoutMs / 3_600_000);
                const minutes = Math.floor((timeoutMs % 3_600_000) / 60_000);

                element.textContent = `${hours}h ${minutes}m`;
            }
        }, interval);
        
        return () => {
            clearInterval(intervalId);
        }
    }
    
    onMount(() => {
        const setFinishedWasPlayingState = () => {
            if (!$selectedFile) {
                return;
            }

            const activelyPlaying = playableDocumentsAndListsWithPoints.isPointActivelyPlaying($selectedFile, spawnedList.id, itemId);
            if (activelyPlaying === true) {
                wasPlaying = null;
                if (wasPlayingTimeout) {
                    clearTimeout(wasPlayingTimeout);
                    wasPlayingTimeout = null;
                }
                return;
            }
            
            if (activelyPlaying !== "finished") {
                return;
            }

            wasPlaying = { finishReason: "finished" };
            if (wasPlayingTimeout) {
                clearTimeout(wasPlayingTimeout);
            }

            wasPlayingTimeout = setTimeout(() => {
                wasPlaying = null;
                wasPlayingTimeout = null;
            }, 30_000);
        };

        const playableDocumentsUnsubscribe = playableDocumentsAndListsWithPoints.subscribe(() => {
            setFinishedWasPlayingState();
        });

        const selectedFileUnsubscribe = selectedFile.subscribe(() => {
            setFinishedWasPlayingState();
        });

        const onCancelPoint = (ev: Event) => {
            const { listId, pointId } = (ev as CustomEvent<{ listId: string, pointId: string }>).detail;

            if (listId === spawnedList.id && pointId === itemId) {
                if (wasPlayingTimeout) {
                    clearTimeout(wasPlayingTimeout);
                    wasPlayingTimeout = null;
                }

                wasPlaying = { finishReason: "stoped" };
            }
        };

        document.addEventListener(CancelPointEvent.EventName, onCancelPoint);
        
        // Reset state of point for playing
        const removePlayEventListener = PlayEvent.listen(targetEvent => {
            if (targetEvent.kind === "document") {
                wasPlaying = null;
            }
            else if (targetEvent.kind === "point") {
                const isSuccessor = isPointSuccessorOfPoint(itemId, targetEvent.pointId, targetEvent.listId);
                if (isSuccessor) {
                    wasPlaying = null;
                }
            }
        });

        const removeStopPlayEventListener = StopPlayEvent.listen(targetEvent => {
            if (targetEvent.kind !== "document" || targetEvent.document.id !== $selectedFile?.id) {
                return;
            }

            if (wasPlayingTimeout) {
                clearTimeout(wasPlayingTimeout);
                wasPlayingTimeout = null;
            }

            wasPlaying = { finishReason: "stoped" };
        });

        return () => {
            playableDocumentsUnsubscribe();
            selectedFileUnsubscribe();
            removePlayEventListener();
            removeStopPlayEventListener();

            if (wasPlayingTimeout) {
                clearTimeout(wasPlayingTimeout);
                wasPlayingTimeout = null;
            }

            document.removeEventListener(CancelPointEvent.EventName, onCancelPoint);
        };
    });
</script>

{#if isPointActivellyPlaying}
    <div 
        class="timer shrink-0 w-8 flex justify-center items-start pt-1 text-xs font-mono"
        {@attach useTimeCounter}
    >
        0
    </div>
{:else if wasPlaying?.finishReason === "finished"}
    <div class="tooltip tooltip-left" data-tip="This point is finished!👌">
        <div class="timer cursor-pointer shrink-0 w-8 flex justify-center items-start pt-1">
            <Icon icon="material-symbols:check-circle-outline-rounded" class="text-base text-success" />
        </div>
    </div>
{:else if wasPlaying?.finishReason === "stoped"}
    <div class="tooltip tooltip-left" data-tip="This point is stoped">
        <div class="timer cursor-pointer shrink-0 w-8 flex justify-center items-start pt-1">
            <Icon icon="material-symbols:close-small-outline-rounded" class="text-base text-error" />
        </div>
    </div>
{:else if isPointPlanned}
    <div
        class="badge badge-xs badge-outline"
    >
        planned
    </div>
{/if}
