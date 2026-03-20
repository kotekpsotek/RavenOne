<script lang="ts">
	import Icon from "@iconify/svelte";
	import { editorAIChat, rightSideStripeChat } from "$lib/stores/aiRightSideChat"

	type TabDropPosition = "before" | "after";

	let isSelectChatListOpen = $state(false);
	let isChatActionsDropdownOpen = $state(false);
	let draggedChatId = $state<string | null>(null);
	let dropTargetChatId = $state<string | null>(null);
	let dropTargetPosition = $state<TabDropPosition | null>(null);
	let chatActionsDropdownPosition = $state<{ top: number; left: number } | null>(null);

	function onWindowResize() {
		if (!isChatActionsDropdownOpen) {
			return;
		}

		updateChatActionsDropdownPosition();
	}

	function onWindowClick(event: MouseEvent) {
		const target = event.target as HTMLElement | null;

		if (!target?.closest("#chat-actions-dropdown")) {
			isChatActionsDropdownOpen = false;
			isSelectChatListOpen = false;
			chatActionsDropdownPosition = null;
		}
	}

	function onTabsScroll(event: WheelEvent) {
		const tabsContainer = event.currentTarget as HTMLDivElement | null;
		if (!tabsContainer) {
			return;
		}

		if (tabsContainer.scrollWidth <= tabsContainer.clientWidth) {
			return;
		}

		// Translate vertical mouse wheel movement into horizontal tab scrolling.
		if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
			event.preventDefault();
			tabsContainer.scrollLeft += event.deltaY;

			if (isChatActionsDropdownOpen) {
				requestAnimationFrame(updateChatActionsDropdownPosition);
			}
		}
	}

	function onTabsAreaScroll() {
		if (!isChatActionsDropdownOpen) {
			return;
		}

		updateChatActionsDropdownPosition();
	}

	function getChatActionsButtonElement(): HTMLButtonElement | null {
		if (typeof document === "undefined") {
			return null;
		}

		const buttonElement = document.getElementById("tab-add-btn");
		return buttonElement instanceof HTMLButtonElement ? buttonElement : null;
	}

	function updateChatActionsDropdownPosition() {
		if (typeof window === "undefined") {
			return;
		}

		const chatActionsButtonEl = getChatActionsButtonElement();
		if (!chatActionsButtonEl) {
			return;
		}

		const dropdownWidth = 240;
		const viewportPadding = 8;
		const estimatedDropdownHeight = isSelectChatListOpen ? 280 : 112;
		const dropdownOffset = 6;
		const rect = chatActionsButtonEl.getBoundingClientRect();

		const left = Math.max(
			viewportPadding,
			Math.min(window.innerWidth - dropdownWidth - viewportPadding, rect.right - dropdownWidth)
		);

		const canOpenDownward = rect.bottom + dropdownOffset + estimatedDropdownHeight <= window.innerHeight - viewportPadding;
		const top = canOpenDownward
			? rect.bottom + dropdownOffset
			: Math.max(viewportPadding, rect.top - estimatedDropdownHeight - dropdownOffset);

		chatActionsDropdownPosition = {
			top,
			left
		};
	}

	function clearTabsDragState() {
		draggedChatId = null;
		dropTargetChatId = null;
		dropTargetPosition = null;
	}

	function getDropPositionFromEvent(event: DragEvent): TabDropPosition | null {
		const target = event.currentTarget as HTMLElement | null;
		if (!target) {
			return null;
		}

		const rect = target.getBoundingClientRect();
		if (!rect.width) {
			return "after";
		}

		return event.clientX - rect.left < rect.width / 2 ? "before" : "after";
	}

	function onTabDragStart(event: DragEvent, chatId: string) {
		draggedChatId = chatId;
		dropTargetChatId = null;
		dropTargetPosition = null;

		if (event.dataTransfer) {
			event.dataTransfer.setData("text/plain", chatId);
			event.dataTransfer.effectAllowed = "move";
		}
	}

	function onTabDragOver(event: DragEvent, chatId: string) {
		if (!draggedChatId) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "move";
		}

		if (draggedChatId === chatId) {
			dropTargetChatId = null;
			dropTargetPosition = null;
			return;
		}

		dropTargetChatId = chatId;
		dropTargetPosition = getDropPositionFromEvent(event);
	}

	function onTabDrop(event: DragEvent, targetChatId: string) {
		event.preventDefault();
		event.stopPropagation();

		if (!draggedChatId || draggedChatId === targetChatId) {
			clearTabsDragState();
			return;
		}

		const position = getDropPositionFromEvent(event);
		if (!position) {
			clearTabsDragState();
			return;
		}

		rightSideStripeChat.reorderChats(draggedChatId, targetChatId, position);
		clearTabsDragState();
	}

	function onTabDragEnd() {
		clearTabsDragState();
	}

	function onAddTabDragOver(event: DragEvent) {
		if (!draggedChatId) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "move";
		}

		const lastChatId = $rightSideStripeChat.chats[$rightSideStripeChat.chats.length - 1]?.id;
		if (!lastChatId || lastChatId === draggedChatId) {
			dropTargetChatId = null;
			dropTargetPosition = null;
			return;
		}

		// Add-tab control is fixed at the end; dropping on it means moving before this button.
		dropTargetChatId = lastChatId;
		dropTargetPosition = "after";
	}

	function onAddTabDrop(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();

		const lastChatId = $rightSideStripeChat.chats[$rightSideStripeChat.chats.length - 1]?.id;
		if (!draggedChatId || !lastChatId || draggedChatId === lastChatId) {
			clearTabsDragState();
			return;
		}

		rightSideStripeChat.reorderChats(draggedChatId, lastChatId, "after");
		clearTabsDragState();
	}

	function isDropAtTabsEnd(): boolean {
		if (!$rightSideStripeChat.chats.length) {
			return false;
		}

		const lastChatId = $rightSideStripeChat.chats[$rightSideStripeChat.chats.length - 1].id;
		return dropTargetChatId === lastChatId && dropTargetPosition === "after";
	}

	function onSelectChat(chatId: string) {
		rightSideStripeChat.setSelectedChatId(chatId);
	}

	function onToggleChatActionsDropdown(event: MouseEvent) {
		event.stopPropagation();

		isChatActionsDropdownOpen = !isChatActionsDropdownOpen;
		if (isChatActionsDropdownOpen) {
			updateChatActionsDropdownPosition();
			return;
		}

		isSelectChatListOpen = false;
		chatActionsDropdownPosition = null;
	}

	function onCreateChatFromDropdown() {
		const nextMode = $editorAIChat.textFieldMode;
		rightSideStripeChat.createChat(nextMode, `${editorAIChat.getTextFieldModeTranslation(nextMode)} chat`);
		isChatActionsDropdownOpen = false;
		isSelectChatListOpen = false;
		chatActionsDropdownPosition = null;
	}

	function onToggleSelectChatList(event: MouseEvent) {
		event.stopPropagation();
		isSelectChatListOpen = !isSelectChatListOpen;

		requestAnimationFrame(updateChatActionsDropdownPosition);
	}

	function onSelectChatFromDropdown(chatId: string) {
		onSelectChat(chatId);
		isChatActionsDropdownOpen = false;
		isSelectChatListOpen = false;
		chatActionsDropdownPosition = null;
	}

    function onCloseActiveTab() {
        $rightSideStripeChat.chats = $rightSideStripeChat.chats.filter(chat => $rightSideStripeChat.selectedChatId !== chat.id);
    }
</script>

<svelte:window onresize={onWindowResize} onclick={onWindowClick} />

<div class="tabs-scroll-area overflow-x-auto overflow-y-visible mt-3 pb-1" onwheel={onTabsScroll} onscroll={onTabsAreaScroll}>
	<div class="tabs tabs-lift bg-base-200 flex flex-nowrap min-w-max">
		{#each $rightSideStripeChat.chats as chat (chat.id)}
			<button
				class="tab chat-tab whitespace-nowrap gap-2 flex-nowrap {chat.id === $rightSideStripeChat.selectedChatId ? 'tab-active' : ''} {draggedChatId === chat.id ? 'opacity-70' : ''} {dropTargetChatId === chat.id && dropTargetPosition === 'before' ? 'chat-tab-drop-before' : ''} {dropTargetChatId === chat.id && dropTargetPosition === 'after' ? 'chat-tab-drop-after' : ''}"
				draggable="true"
				ondragstart={(event) => onTabDragStart(event, chat.id)}
				ondragover={(event) => onTabDragOver(event, chat.id)}
				ondrop={(event) => onTabDrop(event, chat.id)}
				ondragend={onTabDragEnd}
				onclick={() => onSelectChat(chat.id)}
			>
				<span class="truncate max-w-[120px]">{chat.chatName}</span>

				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				{#if chat.id === $rightSideStripeChat.selectedChatId}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<span 
                        class="inline-flex items-center opacity-70"
                        onclick={onCloseActiveTab}
                    >
						<Icon icon="material-symbols:close-rounded" class="text-lg" />
					</span>
				{/if}
			</button>
		{/each}
		<div id="chat-actions-dropdown" class="relative ml-1">
			<button
				id="tab-add-btn"
				type="button"
				class="tab chat-tab whitespace-nowrap {isDropAtTabsEnd() ? 'chat-tab-drop-before' : ''}"
				draggable="false"
				ondragover={onAddTabDragOver}
				ondrop={onAddTabDrop}
				aria-haspopup="menu"
				aria-expanded={isChatActionsDropdownOpen}
				onclick={onToggleChatActionsDropdown}
			>
				<Icon icon="material-symbols:add-2-rounded" />
			</button>

			{#if isChatActionsDropdownOpen}
				<div
					class="fixed z-[250] w-60 rounded-lg border border-base-300 bg-base-100 p-1 shadow-xl"
					style={`top: ${chatActionsDropdownPosition?.top ?? 0}px; left: ${chatActionsDropdownPosition?.left ?? 0}px;`}
				>
					<button
						type="button"
						class="btn btn-ghost btn-sm w-full justify-start"
						onclick={onCreateChatFromDropdown}
					>
						<Icon icon="mdi:plus" width="14" height="14" />
						<span>New chat</span>
					</button>

					<button
						type="button"
						class="btn btn-ghost btn-sm w-full justify-between"
						onclick={onToggleSelectChatList}
					>
						<span>Select Chat from List</span>
						<Icon icon={isSelectChatListOpen ? "mdi:chevron-up" : "mdi:chevron-down"} width="14" height="14" />
					</button>

					{#if isSelectChatListOpen}
						<div class="mt-1 max-h-48 overflow-y-auto border-t border-base-300 pt-1">
							{#if $rightSideStripeChat.chats.length}
								{#each $rightSideStripeChat.chats as chat (chat.id)}
									<button
										type="button"
										class="btn btn-ghost btn-sm w-full justify-start {chat.id === $rightSideStripeChat.selectedChatId ? 'btn-active' : ''}"
										onclick={() => onSelectChatFromDropdown(chat.id)}
									>
										<span class="truncate">{chat.chatName}</span>
									</button>
								{/each}
							{:else}
								<p class="px-2 py-1 text-xs text-base-content/60">No chats available</p>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.tabs-scroll-area {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}

	.tabs-scroll-area::-webkit-scrollbar {
		display: none;
	}

	.chat-tab {
		position: relative;
	}

	.chat-tab-drop-before::before,
	.chat-tab-drop-after::after {
		content: "";
		position: absolute;
		top: 18%;
		height: 64%;
		width: 2px;
		background: oklch(var(--p));
		border-radius: 999px;
	}

	.chat-tab-drop-before::before {
		left: -1px;
	}

	.chat-tab-drop-after::after {
		right: -1px;
	}
</style>
