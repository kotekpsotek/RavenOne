<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/stores";
    import MainSectionArea from "$lib/MainSectionArea.svelte";
    import MainUpperStripe from "$lib/MainUpperStripe.svelte";
	import { entriesList, selectedFile } from "$lib/stores/files";
	import { File } from "@ravenlens/shared";

	function findFileById(items: File.File.File[], fileId: string): File.File.File | undefined {
		for (const item of items) {
			if (item.id === fileId) {
				return item;
			}

			if (item.subentries?.length) {
				const nested = findFileById(item.subentries, fileId);
				if (nested) {
					return nested;
				}
			}
		}

		return undefined;
	}

	$effect(() => {
		const requestedFileId = $page.url.searchParams.get("selectFileId")?.trim();
		if (!requestedFileId) {
			return;
		}

		const unsubscribe = entriesList.subscribe(items => {
			const requestedFile = findFileById(items, requestedFileId);
			if (!requestedFile) {
				return;
			}

			selectedFile.set(requestedFile);
			unsubscribe();
			void goto($page.url.pathname, {
				replaceState: true,
				noScroll: true,
				keepFocus: true
			});
		});

		return () => {
			unsubscribe();
		};
	});
</script>

<div id="main-section-area" class="flex h-full w-full flex-col min-h-0">
	<MainUpperStripe/>
	<div class="flex-1 min-h-0">
		<MainSectionArea/>
	</div>
</div>
