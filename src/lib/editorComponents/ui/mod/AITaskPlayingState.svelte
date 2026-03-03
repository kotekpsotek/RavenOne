<script lang="ts">
    import Icon from "@iconify/svelte";
    import { selectedFile } from "$lib/stores/files";
    import { playableDocumentsWithPoints } from "$lib/stores/playMode";
    import { onMount } from "svelte";

    let { itemId }: { itemId: string } = $props();
    let now = $state(Date.now());
    let finishedUntil = $state<number | null>(null);
    let wasPlaying = false;
    const playablePoint = $derived.by(() => {
        $playableDocumentsWithPoints;

        if (!$selectedFile) {
            return;
        }

        return playableDocumentsWithPoints.getPointPlayable($selectedFile, itemId);
    });
    const isFinishedRecently = $derived(Boolean(finishedUntil && now < finishedUntil));
    const elapsedMs = $derived(playablePoint ? Math.max(0, now - playablePoint.startTimestamp) : 0);
    const timerLabel = $derived.by(() => {
        if (elapsedMs < 1000) {
            return `${elapsedMs}ms`;
        }

        if (elapsedMs > 24 * 60 * 60 * 1000) {
            const days = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
            const hours = Math.floor((elapsedMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            return `${days}d ${hours}h`;
        }

        if (elapsedMs > 60 * 60 * 1000) {
            const hours = Math.floor(elapsedMs / (60 * 60 * 1000));
            const minutes = Math.floor((elapsedMs % (60 * 60 * 1000)) / (60 * 1000));
            return `${hours}h ${minutes}m`;
        }

        if (elapsedMs > 60 * 1000) {
            const minutes = Math.floor(elapsedMs / (60 * 1000));
            const seconds = Math.floor((elapsedMs % (60 * 1000)) / 1000);
            return `${minutes}m ${seconds}s`;
        }

        return `${Math.floor(elapsedMs / 1000)}s`;
    });

    let previousTrackKey = "";

    onMount(() => {
        let timeoutId: ReturnType<typeof setTimeout>;

        const tick = () => {
            const trackKey = `${$selectedFile?.id ?? ""}:${itemId}`;

            if (trackKey !== previousTrackKey) {
                previousTrackKey = trackKey;
                wasPlaying = false;
                finishedUntil = null;
            }

            const isPlaying = Boolean(playablePoint);

            if (wasPlaying && !isPlaying) {
                finishedUntil = Date.now() + 30_000;
            }

            if (isPlaying) {
                finishedUntil = null;
            }

            wasPlaying = isPlaying;
            const currentNow = Date.now();
            now = currentNow;
            const tickDelay = playablePoint && currentNow - playablePoint.startTimestamp < 1000 ? 50 : 1000;
            timeoutId = setTimeout(tick, tickDelay);
        };

        tick();

        return () => clearTimeout(timeoutId);
    });
</script>

{#if playablePoint}
    <div class="timer shrink-0 w-8 flex justify-center items-start pt-1 text-xs font-mono">
        {timerLabel}
    </div>
{:else if isFinishedRecently}
    <div class="tooltip tooltip-left" data-tip="This point is finished!👌">
        <div class="timer cursor-pointer shrink-0 w-8 flex justify-center items-start pt-1">
            <Icon icon="material-symbols:check-circle-outline-rounded" class="text-base text-success" />
        </div>
    </div>
{/if}
