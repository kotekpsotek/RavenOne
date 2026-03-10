<script lang="ts">
	import { onMount, tick } from "svelte";
	import type { NodeViewProps } from "@tiptap/core";
	import Icon from "@iconify/svelte";
	import { NodeViewContent, NodeViewWrapper } from "svelte-tiptap";
	import IconSelectionModal from "$lib/modals/IconSelectionModal.svelte";
	import WallpaperSelectionModal from "$lib/modals/WallpaperSelectionModal.svelte";
	import IconValue from "$lib/IconValue.svelte";
	import { workspaceHasActiveSubscription, workspaceSubscriptionCheckInProgress } from "$lib/stores/subscription";
	import { isCurrentUserSelectedFileEditor } from "$lib/stores/collaboration";
    import { entriesList, selectedFile } from "$lib/stores/files";
	import { setAlert } from "$lib/utils/alert";
    import { renameFileRequest } from "$lib/files/connections/connections";
    import { selectedWorkspace } from "$lib/stores/workspace";
    import { isSharingModeOn } from "$lib/stores/share";

	let { node, updateAttributes, editor, getPos }: NodeViewProps = $props();

	let isIconPickerOpen = $state(false);
	let isWallpaperPickerOpen = $state(false);
	let typingDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let lastCommittedHeading = "";
	let lastObservedHeading = "";
	let lastSyncedFileId = "";
	let lastSyncedFileName = "";

	let icon = $derived((node.attrs.icon as string | undefined) ?? "");
	let walper = $derived($selectedFile?.walper ?? (node.attrs.walper as string | undefined) ?? "");
	let isHeadingEmpty = $state(true);
	let canEditHeadingContent = $derived($isCurrentUserSelectedFileEditor);
	let canEditHeadingAssets = $derived(canEditHeadingContent && !$workspaceSubscriptionCheckInProgress && $workspaceHasActiveSubscription);

	function ensureFileEditorForHeading(operationName: string): boolean {
		if (canEditHeadingContent) {
			return true;
		}

		setAlert(
			"warning",
			"Editor access required",
			`Cannot ${operationName} because you are not a file editor collaborator for this file.`
		);

		return false;
	}

	function ensureWorkspaceSubscriptionForHeadingAssets(operationName: string): boolean {
		if (!ensureFileEditorForHeading(operationName)) {
			return false;
		}

		if (canEditHeadingAssets) {
			return true;
		}

		if (!$workspaceSubscriptionCheckInProgress) {
			setAlert(
				"warning",
				"Active workspace subscription required",
				`Cannot ${operationName} because this workspace has no active subscription.`
			);
		}

		return false;
	}

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

	function updateEntryIconById(entries: any[], fileId: string, nextIcon: string): any[] {
		return entries.map(entry => {
			if (entry.id === fileId) {
				return {
					...entry,
					icon: nextIcon || undefined
				};
			}

			if (entry.subentries?.length) {
				return {
					...entry,
					subentries: updateEntryIconById(entry.subentries, fileId, nextIcon)
				};
			}

			return entry;
		});
	}

	function syncSelectedFileIcon(nextIcon: string) {
		const selectedId = $selectedFile?.id;

		if (!selectedId) {
			return;
		}

		selectedFile.update(current => {
			if (!current || current.id !== selectedId) {
				return current;
			}

			return {
				...current,
				icon: nextIcon || undefined
			};
		});

		entriesList.update(entries => updateEntryIconById(entries, selectedId, nextIcon));
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

		if (!canEditHeadingContent) {
			const selectedFileHeading = ($selectedFile?.name ?? "").trim();
			syncHeadingFromSelectedFile(selectedFileHeading);
			dispatchHeadingTyping(false, selectedFileHeading);
			return;
		}

		isHeadingEmpty = nextHeading.length === 0;
		dispatchHeadingTyping(true, nextHeading);

		if (typingDebounceTimer) {
			clearTimeout(typingDebounceTimer);
		}

		typingDebounceTimer = setTimeout(async () => {
			dispatchHeadingTyping(false, nextHeading);
			typingDebounceTimer = null;

			// Update selected file
			selectedFile.update(current => (current ? { ...current, name: nextHeading } : current));

			// Update file content remotelly
			renameFileRequest(
				$selectedWorkspace?.id!,
				$selectedFile?.id!,
				nextHeading
			).catch(err => console.error(`Cannot update file:`, err));

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

		if (!canEditHeadingContent) {
			const selectedFileHeading = ($selectedFile?.name ?? "").trim();
			syncHeadingFromSelectedFile(selectedFileHeading);
			dispatchHeadingTyping(false, selectedFileHeading);
			return;
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
		if (!ensureWorkspaceSubscriptionForHeadingAssets("change file wallpaper")) {
			return;
		}

		isWallpaperPickerOpen = true;
	}

	function closeWallpaperPicker() {
		isWallpaperPickerOpen = false;
	}

	function applyHeadingWallpaper(nextWalper: string) {
		if (!ensureWorkspaceSubscriptionForHeadingAssets("change file wallpaper")) {
			return;
		}

		updateAttributes({ walper: nextWalper.trim() });
		isWallpaperPickerOpen = false;
	}

	function removeHeadingWallpaper() {
		if (!ensureWorkspaceSubscriptionForHeadingAssets("change file wallpaper")) {
			return;
		}

		updateAttributes({ walper: "" });
		isWallpaperPickerOpen = false;
	}

	function openIconPrompt() {
		if (!ensureWorkspaceSubscriptionForHeadingAssets("change file icon")) {
			return;
		}

		isIconPickerOpen = true;
	}

	function closeIconPicker() {
		isIconPickerOpen = false;
	}

	function applyHeadingIcon(nextIcon: string) {
		if (!ensureWorkspaceSubscriptionForHeadingAssets("change file icon")) {
			return;
		}

		const normalizedIcon = nextIcon.trim();
		updateAttributes({ icon: normalizedIcon });
		syncSelectedFileIcon(normalizedIcon);
		isIconPickerOpen = false;
	}

	function removeHeadingIcon() {
		if (!ensureWorkspaceSubscriptionForHeadingAssets("change file icon")) {
			return;
		}

		updateAttributes({ icon: "" });
		syncSelectedFileIcon("");
		isIconPickerOpen = false;
	}

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

		const onFileIconChange = (event: Event) => {
			const customEvent = event as CustomEvent<string | { fileId?: string; icon?: string }>;
			const detail = customEvent.detail;
			const nextIcon = (typeof detail === "string" ? detail : detail?.icon ?? "").trim();
			const fileId = typeof detail === "string" ? ($selectedFile?.id ?? "") : (detail?.fileId ?? "");

			if (!fileId || fileId !== $selectedFile?.id) {
				return;
			}

			updateAttributes({ icon: nextIcon });
			syncSelectedFileIcon(nextIcon);
		};

		// Event retrived only when selected file name was editted from leftstripe
		const stopSelectedFileSync = selectedFile.subscribe(current => {
			const selectedId = current?.id ?? "";
			const selectedName = (current?.name ?? "").trim();
			const selectedIcon = current?.icon ?? "";
			const selectedWalper = current?.walper ?? "";

			if (!selectedId) {
				return;
			}

			if (selectedId === lastSyncedFileId && selectedName === lastSyncedFileName) {
				return;
			}

			lastSyncedFileId = selectedId;
			lastSyncedFileName = selectedName;
			icon = selectedIcon;
			walper = selectedWalper;

			if (icon !== node.attrs.icon || walper !== node.attrs.walper) {
				updateAttributes({
					...node.attrs,
					icon: icon,
					walper: walper
				})
			}

			syncHeadingFromSelectedFile(selectedName);
		});

		editor.on("update", onEditorUpdate);
		document.addEventListener("file-name-change:leftstripe", onFileNameChange);
		document.addEventListener("file-icon-change:leftstripe", onFileIconChange);

		return () => {
			editor.off("update", onEditorUpdate);

			if (typingDebounceTimer) {
				clearTimeout(typingDebounceTimer);
				typingDebounceTimer = null;
			}

			document.removeEventListener("file-name-change:leftstripe", onFileNameChange);
			document.removeEventListener("file-icon-change:leftstripe", onFileIconChange);
			stopSelectedFileSync();
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
				disabled={!canEditHeadingAssets}
				title={!canEditHeadingAssets ? "Active workspace subscription required" : "Change cover"}
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
					disabled={!canEditHeadingAssets}
					title={!canEditHeadingAssets ? "Active workspace subscription required" : "Change icon"}
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

			<div 
				class="py-1 flex items-center gap-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
				hidden={$isSharingModeOn}
			>
				{#if !icon}
					<button
						type="button"
						class="btn btn-ghost btn-xs"
						contenteditable="false"
						onclick={openIconPrompt}
						disabled={!canEditHeadingAssets}
						title={!canEditHeadingAssets ? "Active workspace subscription required" : "Add icon"}
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
						disabled={!canEditHeadingAssets}
						title={!canEditHeadingAssets ? "Active workspace subscription required" : "Add cover"}
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
