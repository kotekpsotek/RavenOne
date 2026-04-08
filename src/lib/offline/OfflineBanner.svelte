<script lang="ts">
	import { onMount } from "svelte";
	import {
		connectivityStatus,
		initializeConnectivityWatcher,
		refreshConnectivityStatus,
	} from "$lib/offline/connectivity";

	onMount(() => {
		initializeConnectivityWatcher();
		void refreshConnectivityStatus({ forceProbe: true });
	});
</script>

{#if !$connectivityStatus.isOnline}
	<aside
		class="fixed left-1/2 top-2 z-[70] flex w-[calc(100vw-1.5rem)] max-w-[40rem] -translate-x-1/2 items-center gap-3 rounded-xl border border-warning/70 bg-warning/15 px-4 py-3 text-base-content shadow-xl backdrop-blur-sm transition-all duration-200 ease-out sm:top-3 sm:rounded-2xl"
		role="status"
		aria-live="polite"
	>
		<div class="h-3 w-3 shrink-0 rounded-full bg-warning ring-4 ring-warning/30" aria-hidden="true"></div>
		<div class="flex flex-col leading-tight text-base-content/90">
			<strong class="text-sm">Offline mode active</strong>
			<span class="mt-0.5 text-xs">Your changes stay local until the connection is restored.</span>
		</div>
	</aside>
{/if}
