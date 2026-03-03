<script lang="ts">
	import { onMount, tick } from "svelte";
	import type { NodeViewProps } from "@tiptap/core";
	import Icon from "@iconify/svelte";
	import { NodeViewContent, NodeViewWrapper } from "svelte-tiptap";
	import IconSelectionModal from "$lib/modals/IconSelectionModal.svelte";
	import WallpaperSelectionModal from "$lib/modals/WallpaperSelectionModal.svelte";
	import IconValue from "$lib/IconValue.svelte";
    import { entriesList, selectedFile } from "$lib/stores/files";

	let { node, updateAttributes, editor, getPos }: NodeViewProps = $props();

	let isIconPickerOpen = $state(false);
	let isWallpaperPickerOpen = $state(false);
	let typingDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let lastCommittedHeading = "";
	let lastObservedHeading = "";
	let lastSyncedFileId = "";
	let lastSyncedFileName = "";

	let icon = $derived((node.attrs.icon as string | undefined) ?? "");
	let walper = $derived((node.attrs.walper as string | undefined) ?? "");
	let isHeadingEmpty = $state(true);

	function dispatchHeadingTyping(isTyping: boolean, value: string) {
		document.dispatchEvent(
			new CustomEvent("file-heading-typing:editor", {
				detail: { isTyping, value }
			})
		);
	}

	function dispatchHeadingChanged(value: string) {
		document.dispatchEvent(
			new CustomEvent("file-heading-change:editor", {
				detail: { value }
			})
		);
	}

	function updateEntryNameById(entries: any[], fileId: string, nextHeading: string): any[] {
		return entries.map(entry => {
			if (entry.id === fileId) {
				return {
					...entry,
					name: nextHeading
				};
			}

			if (entry.subentries?.length) {
				return {
					...entry,
					subentries: updateEntryNameById(entry.subentries, fileId, nextHeading)
				};
			}

			return entry;
		});
	}

	function getCurrentHeadingText() {
		const position = getPos();

		if (typeof position !== "number") {
			return (node.textContent ?? "").trim();
		}

		const headingNode = editor.state.doc.nodeAt(position);
		return (headingNode?.textContent ?? node.textContent ?? "").trim();
	}

	function syncHeadingFromSelectedFile(nextTitle: string, shouldEmitChange = false) {
		const position = getPos();

		if (typeof position !== "number") {
			return;
		}

		const currentHeading = getCurrentHeadingText();

		if (currentHeading === nextTitle) {
			lastCommittedHeading = nextTitle;
			lastObservedHeading = nextTitle;
			isHeadingEmpty = nextTitle.length === 0;
			return;
		}

		const from = position + 1;
		const to = position + node.nodeSize - 1;
		const tr = editor.state.tr.insertText(nextTitle, from, to);

		editor.view.dispatch(tr);
		lastCommittedHeading = nextTitle;
		lastObservedHeading = nextTitle;
		isHeadingEmpty = nextTitle.length === 0;

		if (shouldEmitChange) {
			dispatchHeadingChanged(nextTitle);
		}
	}

	function onHeadingInput() {
		const nextHeading = getCurrentHeadingText();
		isHeadingEmpty = nextHeading.length === 0;
		dispatchHeadingTyping(true, nextHeading);

		if (typingDebounceTimer) {
			clearTimeout(typingDebounceTimer);
		}

		typingDebounceTimer = setTimeout(() => {
			dispatchHeadingTyping(false, nextHeading);
			typingDebounceTimer = null;

			// Update selected file
			selectedFile.update(current => (current ? { ...current, name: nextHeading } : current));

			// Update the file on entires list
			entriesList.update(entries => {
				if (!$selectedFile?.id) {
					return entries;
				}

				return updateEntryNameById(entries, $selectedFile.id, nextHeading);
			});

			if (nextHeading !== lastCommittedHeading) {
				lastCommittedHeading = nextHeading;
				dispatchHeadingChanged(nextHeading);
			}

			lastObservedHeading = nextHeading;
		}, 300);
	}

	function onHeadingBlur() {
		if (typingDebounceTimer) {
			clearTimeout(typingDebounceTimer);
			typingDebounceTimer = null;
		}

		const nextHeading = getCurrentHeadingText();
		isHeadingEmpty = nextHeading.length === 0;
		dispatchHeadingTyping(false, nextHeading);

		if (nextHeading !== lastCommittedHeading) {
			lastCommittedHeading = nextHeading;
			dispatchHeadingChanged(nextHeading);
		}

		lastObservedHeading = nextHeading;
	}
	
	function openWallpaperPicker() {
		isWallpaperPickerOpen = true;
	}

	function closeWallpaperPicker() {
		isWallpaperPickerOpen = false;
	}

	function applyHeadingWallpaper(nextWalper: string) {
		updateAttributes({ walper: nextWalper.trim() });
		isWallpaperPickerOpen = false;
	}

	function removeHeadingWallpaper() {
		updateAttributes({ walper: "" });
		isWallpaperPickerOpen = false;
	}

	function openIconPrompt() {
		isIconPickerOpen = true;
	}

	function closeIconPicker() {
		isIconPickerOpen = false;
	}

	function applyHeadingIcon(nextIcon: string) {
		updateAttributes({ icon: nextIcon.trim() });
		isIconPickerOpen = false;
	}

	function removeHeadingIcon() {
		updateAttributes({ icon: "" });
		isIconPickerOpen = false;
	}

	$effect(() => {
		const selectedId = $selectedFile?.id ?? "";
		const selectedName = ($selectedFile?.name ?? "").trim();

		if (!selectedId) {
			return;
		}

		if (selectedId === lastSyncedFileId && selectedName === lastSyncedFileName) {
			return;
		}

		lastSyncedFileId = selectedId;
		lastSyncedFileName = selectedName;
		syncHeadingFromSelectedFile(selectedName);
	});

	onMount(() => {
		lastCommittedHeading = getCurrentHeadingText();
		lastObservedHeading = lastCommittedHeading;

		void (async () => {
			await tick();

			const initialHeading = ($selectedFile?.name ?? "").trim();
			syncHeadingFromSelectedFile(initialHeading);
		})();

		const onEditorUpdate = () => {
			const nextHeading = getCurrentHeadingText();

			if (nextHeading === lastObservedHeading) {
				return;
			}

			lastObservedHeading = nextHeading;
			onHeadingInput();
		};

		const onFileNameChange = (event: Event) => {
			const customEvent = event as CustomEvent<string | { value?: string }>;
			const detail = customEvent.detail;
			const nextTitle = (typeof detail === "string" ? detail : detail?.value ?? "").trim();
			syncHeadingFromSelectedFile(nextTitle);

			selectedFile.update(current => (current ? { ...current, name: nextTitle } : current));
			entriesList.update(entries => {
				if (!$selectedFile?.id) {
					return entries;
				}

				return updateEntryNameById(entries, $selectedFile.id, nextTitle);
			});

			lastSyncedFileName = nextTitle;
			dispatchHeadingChanged(lastCommittedHeading);
		};

		// Event retrived only when selected file name was editted from leftstripe
		editor.on("update", onEditorUpdate);
		document.addEventListener("file-name-change:leftstripe", onFileNameChange);

		return () => {
			editor.off("update", onEditorUpdate);

			if (typingDebounceTimer) {
				clearTimeout(typingDebounceTimer);
				typingDebounceTimer = null;
			}

			document.removeEventListener("file-name-change:leftstripe", onFileNameChange);
		};
	});
</script>

<NodeViewWrapper class="group block mb-2">
	<section class="relative overflow-visible rounded-2xl bg-transparent space-y-4">
		{#if walper}
			<button
				type="button"
				class="group/cover relative block h-52 w-full cursor-pointer overflow-hidden rounded-2xl border-0 p-0 leading-none align-top appearance-none"
				contenteditable="false"
				onclick={openWallpaperPicker}
			>
				<img
					src={walper}
					alt="Heading cover"
					class="pointer-events-none absolute -inset-px block h-[calc(100%+2px)] w-[calc(100%+2px)] max-w-none object-cover"
					draggable="false"
				/>
				<span class="pointer-events-none absolute inset-0 bg-base-300/0 transition-colors duration-150 group-hover/cover:bg-base-300/30"></span>
				<span class="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-md bg-base-100/80 px-2 py-1 text-xs font-medium text-base-content opacity-0 transition-opacity duration-150 group-hover/cover:opacity-100">
					<Icon icon="material-symbols:wallpaper-outline-rounded" class="text-sm" />
					Change Cover
				</span>
			</button>
		{/if}

		<div class="relative pt-3">
			<IconSelectionModal
				open={isIconPickerOpen}
				currentValue={icon}
				onClose={closeIconPicker}
				onSelect={applyHeadingIcon}
				onRemove={removeHeadingIcon}
			/>

			{#if icon}
				<button
					type="button"
					class="mb-2 mt-2 rounded-xl px-3 py-2 leading-none transition-colors duration-150 hover:bg-base-300/50"
					contenteditable="false"
					onclick={openIconPrompt}
					aria-label="Change icon"
				>
					<IconValue
						iconValue={icon}
						iconClass="text-6xl"
						emojiClass="text-6xl leading-none"
						imageClass="h-14 w-14"
						alt="Heading icon"
					/>
				</button>
			{/if}

			<div class="py-1 flex items-center gap-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
				{#if !icon}
					<button
						type="button"
						class="btn btn-ghost btn-xs"
						contenteditable="false"
						onclick={openIconPrompt}
					>
						<Icon icon="material-symbols:sentiment-satisfied-outline-rounded" class="text-sm" />
						Add icon
					</button>
				{/if}

				{#if !walper}
					<button
						type="button"
						class="btn btn-ghost btn-xs"
						contenteditable="false"
						onclick={openWallpaperPicker}
					>
						<Icon icon="material-symbols:image-outline-rounded" class="text-sm" />
						Add cover
					</button>
				{/if}
			</div>

			<WallpaperSelectionModal
				open={isWallpaperPickerOpen}
				currentValue={walper}
				onClose={closeWallpaperPicker}
				onSelect={applyHeadingWallpaper}
				onRemove={removeHeadingWallpaper}
			/>

			<div class="relative w-full min-h-[3.75rem]">
				{#if isHeadingEmpty}
					<span class="pointer-events-none absolute left-0 top-0 block text-5xl font-bold leading-tight text-base-content/35">
						Document Name
					</span>
				{/if}

				<NodeViewContent
					as="h1"
					class="document-title pt-1 m-0 mb-0 min-h-[3.75rem] text-5xl font-semibold leading-tight text-base-content outline-none"
					oninput={onHeadingInput}
					onfocusout={onHeadingBlur}
				/>
			</div>
		</div>
	</section>
</NodeViewWrapper>
