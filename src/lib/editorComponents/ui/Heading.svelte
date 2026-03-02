<script lang="ts">
	import type { NodeViewProps } from "@tiptap/core";
	import Icon from "@iconify/svelte";
	import { NodeViewContent, NodeViewWrapper } from "svelte-tiptap";
	import IconSelectionModal from "$lib/modals/IconSelectionModal.svelte";
	import WallpaperSelectionModal from "$lib/modals/WallpaperSelectionModal.svelte";
	import IconValue from "$lib/IconValue.svelte";

	let { node, updateAttributes }: NodeViewProps = $props();

	let isIconPickerOpen = $state(false);
	let isWallpaperPickerOpen = $state(false);

	let icon = $derived((node.attrs.icon as string | undefined) ?? "");
	let walper = $derived((node.attrs.walper as string | undefined) ?? "");
	let isHeadingEmpty = $derived((node.textContent ?? "").trim().length === 0);

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
				/>
			</div>
		</div>
	</section>
</NodeViewWrapper>
