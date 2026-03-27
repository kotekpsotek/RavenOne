<script lang="ts">
	import Icon from "@iconify/svelte";
	import {
		activeChat,
		chatStripeTabsOfWorkspaceFile,
		loadedChatsOfWorkspaceFile,
		processingChatsOfWorkspaceFile
	} from "$lib/stores/aiRightSideChat"
    import CollaboratorsBubbles from "$lib/components/CollaboratorsBubbles.svelte";
    import type { DownloadChat, ProfileActiveCollborator } from "@ravenlens/shared/chat-ai/backend/schema";
    import { mapChatCollaboratorsToBubbleCollabs } from "./utils";

	type ChatGroup = {
		key: string;
		title: string;
		chats: DownloadChat[];
	};

	let {
		onOpenChat
	}: {
		onOpenChat: () => void;
	} = $props();

	const dateTitleFormatter = new Intl.DateTimeFormat(undefined, {
		day: "2-digit",
		month: "2-digit",
		year: "numeric"
	});

	let sortedChats = $derived(
		[...$loadedChatsOfWorkspaceFile].sort((chatA, chatB) => {
			return (chatB.createdAt instanceof Date ? chatB.createdAt : getDateFromInput(chatB.createdAt)).getTime() - (chatA.createdAt instanceof Date ? chatA.createdAt : getDateFromInput(chatA.createdAt)).getTime();
		})
	);

	let groupedChats = $derived(groupChatsByDate(sortedChats));

	function getDateFromInput(dateInput: string | Date): Date {
		if (dateInput instanceof Date) {
			return dateInput;
		}

		const nextDate = new Date(dateInput);
		return Number.isNaN(nextDate.getTime()) ? new Date() : nextDate;
	}

	function getDayStart(dateInput: Date): Date {
		return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
	}

	function toDayKey(dayStart: Date): string {
		const year = dayStart.getFullYear();
		const month = `${dayStart.getMonth() + 1}`.padStart(2, "0");
		const day = `${dayStart.getDate()}`.padStart(2, "0");

		return `${year}-${month}-${day}`;
	}

	function isSameDay(dayA: Date, dayB: Date): boolean {
		return dayA.getFullYear() === dayB.getFullYear()
			&& dayA.getMonth() === dayB.getMonth()
			&& dayA.getDate() === dayB.getDate();
	}

	function getDateGroupTitle(dayStart: Date): string {
		const today = getDayStart(new Date());
		const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);

		if (isSameDay(dayStart, today)) {
			return "Today";
		}

		if (isSameDay(dayStart, yesterday)) {
			return "Yesterday";
		}

		return dateTitleFormatter.format(dayStart);
	}

	function groupChatsByDate(chats: DownloadChat[]): ChatGroup[] {
		const groupedByKey: Record<string, ChatGroup> = {};
		const orderedGroups: ChatGroup[] = [];

		for (const chat of chats) {
			const createdDate = (chat.createdAt instanceof Date ? chat.createdAt : getDateFromInput(chat.createdAt));
			const dayStart = getDayStart(createdDate);
			const groupKey = toDayKey(dayStart);
			const existingGroup = groupedByKey[groupKey];

			if (!existingGroup) {
				const nextGroup: ChatGroup = {
					key: groupKey,
					title: getDateGroupTitle(dayStart),
					chats: [chat]
				};

				groupedByKey[groupKey] = nextGroup;
				orderedGroups.push(nextGroup);
				continue;
			}

			existingGroup.chats.push(chat);
		}

		return orderedGroups;
	}

	function formatChatTime(createdAt: string | Date): string {
		const date = getDateFromInput(createdAt);
		const hours = `${date.getHours()}`.padStart(2, "0");
		const minutes = `${date.getMinutes()}`.padStart(2, "0");

		return `${hours}:${minutes}`;
	}

	function onSelectChat(chatId: string) {
		chatStripeTabsOfWorkspaceFile.openChatTab(chatId);
		onOpenChat();
	}

	function isChatActive(chatId: string): boolean {
		return $activeChat?.id === chatId;
	}

	function getChatCollaborators(chat: DownloadChat) {
		const activeCollaborators = chat.inFileCollaborators.filter(
			(collab) => (collab as ProfileActiveCollborator).isActive
		);
		const allCollaborators = [...activeCollaborators, ...chat.collaborators];

		// Gets only unique collabs
		const uniqueCollaborators = Array.from(
			new Map(allCollaborators.map((c) => [c.id, c])).values()
		).map(collab => ({ // Has to be done since original acitve collabs looses context
			...collab,
			isActive: activeCollaborators.some(collabThere => collabThere.id === collab.id && (collabThere as ProfileActiveCollborator).isActive) ?? false
		}));
		
		// Maps collabs to 
		const mapped = mapChatCollaboratorsToBubbleCollabs(uniqueCollaborators);

		// List with collabs
		return mapped;
	}
</script>

<section class="h-full flex flex-col min-h-0">
	{#if groupedChats.length}
		<div class="flex-1 min-h-0 overflow-y-auto px-2 py-3 space-y-3">
			{#each groupedChats as group (group.key)}
				<section>
					<h3 class="px-1 text-xs font-semibold uppercase tracking-wide text-base-content/60">{group.title}</h3>

					<div class="mt-2 space-y-1">
						{#each group.chats as chat (chat.id)}
							<button
								type="button"
								class="w-full rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-base-200 {isChatActive(chat.id) ? 'border-primary bg-primary/10' : ''}"
								onclick={() => onSelectChat(chat.id)}
							>
								<div class="flex items-center justify-between gap-2">
									<span class="truncate text-sm font-medium ">{chat.chatName}</span>
									<div class="w-fit flex gap-3 items-center">
										{#if $processingChatsOfWorkspaceFile[chat.id]}
											<span class="loading loading-spinner loading-xs"></span>
										{/if}
										<CollaboratorsBubbles
											collaborators={getChatCollaborators(chat)}
											MAX_VISIBLE_COLLABORATORS={3}
											activeUserSuffix="Interacting User"
											size="small"
										/>
										<span class="shrink-0 text-xs text-base-content/60">{formatChatTime(chat.createdAt)}</span>
									</div>
								</div>
							</button>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{:else}
		<div class="flex-1 min-h-0 flex items-center justify-center px-4 text-center text-base-content/60">
			<div class="space-y-1">
				<Icon icon="mdi:chat-outline" width="22" height="22" class="mx-auto" />
				<p class="text-sm">No chats yet. Create your first chat.</p>
			</div>
		</div>
	{/if}
</section>
