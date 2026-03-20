import { get, writable, type Updater } from "svelte/store";
import { selectedFile } from "./files";
import { browser } from "$app/environment";
import { loadChatsFromFile } from "$lib/sideStripe/rightStripeChat/connections";
import { selectedWorkspace } from "./workspace";
import { isChatSideStripeSelected } from "./selectedSideStripes";
import type { File } from "@ravenlens/shared";
import type { AIChatMode, ChatTab } from "@ravenlens/shared/chat-ai/frontend";
import type { BackendChatPopulated } from "@ravenlens/shared/chat-ai/backend/schema";
import { userProfile } from "./user";

export const isLoadedChatsOfWorkspaceFileLoading = writable<boolean>(false);

// TODO: Once chat is open and aren't loaded chats then load the chats
// TODO: -> Show chats loading icon in Chats.svelte when chats are loading
/** It's the set with backend loaded chats */
export const loadedChatsOfWorkspaceFile = (() => {
	const { ...all } = writable<BackendChatPopulated[]>([]);
	let latestLoadRequestId = 0;
	let loadedScopeKey: string | undefined;

	const getCurrentScope = (): { fileId: string; workspaceId: string } | undefined => {
		const selectedFileLocal = get(selectedFile);
		const selectedWorkspaceLocal = get(selectedWorkspace);

		if (!selectedFileLocal || !selectedWorkspaceLocal) {
			return undefined;
		}

		return {
			fileId: selectedFileLocal.id,
			workspaceId: selectedWorkspaceLocal.id
		};
	};

	const loadChatsForCurrentScope = async (): Promise<void> => {
		const chatStripeSelected = get(isChatSideStripeSelected);
		const currentScope = getCurrentScope();

		if (!chatStripeSelected || !currentScope) {
			latestLoadRequestId += 1;
			isLoadedChatsOfWorkspaceFileLoading.set(false);
			loadedScopeKey = undefined;
			all.set([]);
			return;
		}

		const scopeKey = `${currentScope.workspaceId}:${currentScope.fileId}`;
		if (scopeKey === loadedScopeKey) {
			return;
		}

		const requestId = ++latestLoadRequestId;
		isLoadedChatsOfWorkspaceFileLoading.set(true);
		all.set([]);

		const chatsFromBackend = await loadChatsFromFile(
			currentScope.fileId,
			currentScope.workspaceId
		);

		if (requestId !== latestLoadRequestId) {
			return;
		}

		loadedScopeKey = scopeKey;
		all.set(chatsFromBackend);
		isLoadedChatsOfWorkspaceFileLoading.set(false);
	};

	if (browser) {
		// Delay subscription to avoid TDZ circular dependency issues with selectedFile
		queueMicrotask(() => {
			selectedFile.subscribe(() => {
				void loadChatsForCurrentScope();
			});
		
			selectedWorkspace.subscribe(() => {
				void loadChatsForCurrentScope();
			});
		
			isChatSideStripeSelected.subscribe(() => {
				void loadChatsForCurrentScope();
			});
		});
	}
	
	// 
	return {
		...all
	}
})();

/**
 * It's the list with open chat stripe tabs
*/
export const chatStripeTabsOfWorkspaceFile = (() => {
	const { ...all } = writable<ChatTab[]>([]);
	type ChatTabModel = NonNullable<ChatTab["selectedModel"]>;
	type StoredChatTabSettings = Pick<ChatTab, "selectedMode" | "selectedModel" | "selectedContext" | "selectedMCPServers">;

	const constructTabsRememberidIdKey = (fileId: string, workspaceId: string) => `tabsForWorkspaceFile:${workspaceId}:${fileId}`;
	const constructActiveChatRememberingKey = (fileId: string, workspaceId: string) => `activeChatId:${workspaceId}:${fileId}`;
	const constructTabSettingsRememberingKey = (fileId: string, workspaceId: string, chatId: string) => `tabSettingsForWorkspaceFile:${workspaceId}:${fileId}:${chatId}`;

	const createDefaultSelectedContext = (): ChatTab["selectedContext"] => {
		return {
			desktopFiles: [],
			editorFiles: [],
			networkUrls: [],
			aiAnswers: []
		};
	};

	const normalizeSelectedMode = (modeCandidate: unknown): ChatTab["selectedMode"] => {
		if (modeCandidate === "regular-ask" || modeCandidate === "tasks-creation" || modeCandidate === "document-manipulation") {
			return modeCandidate;
		}

		return "regular-ask";
	};

	const normalizeSelectedMCPServers = (serversCandidate: unknown): string[] => {
		if (!Array.isArray(serversCandidate)) {
			return [];
		}

		const normalized = serversCandidate
			.filter((serverName): serverName is string => typeof serverName === "string")
			.map(serverName => serverName.trim())
			.filter(serverName => serverName.length > 0);

		return [...new Set(normalized)];
	};

	const normalizeSelectedModel = (modelCandidate: unknown): ChatTab["selectedModel"] => {
		if (!modelCandidate || typeof modelCandidate !== "object") {
			return undefined;
		}

		const asMaybeModel = modelCandidate as { model?: unknown; provider?: unknown };
		if (typeof asMaybeModel.model !== "string" || asMaybeModel.model.trim().length === 0) {
			return undefined;
		}

		if (typeof asMaybeModel.provider !== "string" || asMaybeModel.provider.trim().length === 0) {
			return undefined;
		}

		return {
			model: asMaybeModel.model,
			provider: asMaybeModel.provider as ChatTabModel["provider"]
		};
	};

	const normalizeSelectedContext = (
		contextCandidate: unknown,
		fallbackContext: ChatTab["selectedContext"] = createDefaultSelectedContext()
	): ChatTab["selectedContext"] => {
		if (!contextCandidate || typeof contextCandidate !== "object") {
			return createDefaultSelectedContext();
		}

		const asMaybeContext = contextCandidate as Partial<ChatTab["selectedContext"]>;
		return {
			desktopFiles: Array.isArray(asMaybeContext.desktopFiles)
				? [...asMaybeContext.desktopFiles] as ChatTab["selectedContext"]["desktopFiles"]
				: [...fallbackContext.desktopFiles],
			editorFiles: Array.isArray(asMaybeContext.editorFiles)
				? [...asMaybeContext.editorFiles] as ChatTab["selectedContext"]["editorFiles"]
				: [...fallbackContext.editorFiles],
			networkUrls: Array.isArray(asMaybeContext.networkUrls)
				? [...asMaybeContext.networkUrls] as ChatTab["selectedContext"]["networkUrls"]
				: [...fallbackContext.networkUrls],
			aiAnswers: Array.isArray(asMaybeContext.aiAnswers)
				? [...asMaybeContext.aiAnswers] as ChatTab["selectedContext"]["aiAnswers"]
				: [...fallbackContext.aiAnswers]
		};
	};

	const normalizeTabSettings = (
		settingsCandidate: Partial<StoredChatTabSettings> | undefined,
		fallbackTab?: ChatTab
	): StoredChatTabSettings => {
		const fallbackContext = fallbackTab
			? normalizeSelectedContext(fallbackTab.selectedContext)
			: createDefaultSelectedContext();

		return {
			selectedMode: normalizeSelectedMode(settingsCandidate?.selectedMode ?? fallbackTab?.selectedMode),
			selectedModel: normalizeSelectedModel(settingsCandidate?.selectedModel ?? fallbackTab?.selectedModel),
			selectedContext: normalizeSelectedContext(settingsCandidate?.selectedContext, fallbackContext),
			selectedMCPServers: normalizeSelectedMCPServers(settingsCandidate?.selectedMCPServers ?? fallbackTab?.selectedMCPServers)
		};
	};

	const loadStoredTabSettings = (fileId: string, workspaceId: string, chatId: string, fallbackTab?: ChatTab): StoredChatTabSettings | undefined => {
		if (!browser) {
			return undefined;
		}

		const key = constructTabSettingsRememberingKey(fileId, workspaceId, chatId);
		try {
			const rawSettings = localStorage.getItem(key);
			if (!rawSettings) {
				return undefined;
			}

			const parsedSettings = JSON.parse(rawSettings) as Partial<StoredChatTabSettings>;
			return normalizeTabSettings(parsedSettings, fallbackTab);
		}
		catch (err) {
			console.error(`Error when parsing localStorage tab settings`, err);
			return undefined;
		}
	};

	const saveTabSettings = (fileId: string, workspaceId: string, tab: ChatTab): void => {
		if (!browser) {
			return;
		}

		const key = constructTabSettingsRememberingKey(fileId, workspaceId, tab.id);
		const settingsToSave = normalizeTabSettings(undefined, tab);
		localStorage.setItem(key, JSON.stringify(settingsToSave));
	};

	const mergeTabWithStoredSettings = (tab: ChatTab, fileId: string, workspaceId: string): ChatTab => {
		const storedSettings = loadStoredTabSettings(fileId, workspaceId, tab.id, tab);
		if (!storedSettings) {
			return tab;
		}

		return {
			...tab,
			...storedSettings
		};
	};

	const getCurrentScope = (): { fileId: string; workspaceId: string } | undefined => {
		const selectedFileLocal = get(selectedFile);
		const selectedWorkspaceLocal = get(selectedWorkspace);

		if (!selectedFileLocal || !selectedWorkspaceLocal) {
			return undefined;
		}

		return {
			fileId: selectedFileLocal.id,
			workspaceId: selectedWorkspaceLocal.id
		};
	};

	const normalizeTabIds = (ids: string[]): string[] => {
		const normalizedIds = ids
			.map(id => (typeof id === "string" ? id.trim() : ""))
			.filter((id): id is string => id.length > 0);

		return [...new Set(normalizedIds)];
	};

	const stripActiveState = (tab: ChatTab): ChatTab => {
		const { isActive: _isActive, ...tabWithoutActive } = tab;
		return tabWithoutActive as ChatTab;
	};

	const normalizeActiveTab = (tabs: ChatTab[], preferredActiveTabId?: string): ChatTab[] => {
		if (!tabs.length) {
			return [];
		}

		const activeTabId =
			(preferredActiveTabId && tabs.some(tab => tab.id === preferredActiveTabId) ? preferredActiveTabId : undefined)
			?? tabs.find(tab => tab.isActive)?.id
			?? tabs[0].id;

		return tabs.map(tab => {
			const tabWithoutActive = stripActiveState(tab);
			if (tab.id === activeTabId) {
				return {
					...tabWithoutActive,
					isActive: true
				};
			}

			return tabWithoutActive;
		});
	};

	const getActiveChatTabId = (fileId: string, workspaceId: string): string | undefined => {
		if (!browser) {
			return undefined;
		}

		const key = constructActiveChatRememberingKey(fileId, workspaceId);
		const activeChatTabId = localStorage.getItem(key);

		return activeChatTabId ?? undefined;
	};

	const setActiveChatTabId = (fileId: string, workspaceId: string, chatId?: string): boolean => {
		if (!browser) {
			return false;
		}

		const key = constructActiveChatRememberingKey(fileId, workspaceId);
		if (chatId && chatId.trim().length > 0) {
			localStorage.setItem(key, chatId);
		}
		else {
			localStorage.removeItem(key);
		}

		return true;
	};

	const readTabId = (tabCandidate: unknown): string | undefined => {
		if (typeof tabCandidate === "string" && tabCandidate.trim().length > 0) {
			return tabCandidate;
		}

		if (tabCandidate && typeof tabCandidate === "object" && "id" in tabCandidate) {
			const possibleId = (tabCandidate as { id?: unknown }).id;
			if (typeof possibleId === "string" && possibleId.trim().length > 0) {
				return possibleId;
			}
		}

		return undefined;
	};

	const loadTabIds = (fileId: string, workspaceId: string): string[] => {
		if (!browser) {
			return [];
		}

		try {
			const tabsRaw = localStorage.getItem(constructTabsRememberidIdKey(fileId, workspaceId));

			if (!tabsRaw) {
				return [];
			}

			const tabsReady = JSON.parse(tabsRaw) as unknown;
			if (!(tabsReady instanceof Array)) {
				throw("Tabs aren't array");
			}

			const loadedIds = tabsReady
				.map(readTabId)
				.filter((tabId): tabId is string => Boolean(tabId));

			return normalizeTabIds(loadedIds);
		}
		catch (err) {
			console.error(`Error when parsing localStorage tabs`, err);
			return [];
		}
	};

	const createChatTabFromLoadedChat = (chat: BackendChatPopulated): ChatTab => {
		const asMaybeTab = chat as Partial<ChatTab>;
		return {
			...chat,
			selectedMode: normalizeSelectedMode(asMaybeTab.selectedMode),
			selectedModel: normalizeSelectedModel(asMaybeTab.selectedModel),
			selectedContext: normalizeSelectedContext(asMaybeTab.selectedContext),
			selectedMCPServers: normalizeSelectedMCPServers(asMaybeTab.selectedMCPServers)
		};
	};

	const loadTabChats = (tabsId: string[], fileId: string, workspaceId: string): ChatTab[] => {
		const fileChatsStateLocal = get(loadedChatsOfWorkspaceFile);
		if (!tabsId.length || !fileChatsStateLocal.length) {
			return [];
		}

		const chatsById = new Map(fileChatsStateLocal.map(chat => [chat.id, chat]));
		const chatsAreInTab = tabsId.flatMap(tabId => {
			const tabChat = chatsById.get(tabId);
			if (!tabChat) {
				return [];
			}

			const tabFromBackend = createChatTabFromLoadedChat(tabChat);
			return [mergeTabWithStoredSettings(tabFromBackend, fileId, workspaceId)];
		});

		const activeChatId = getActiveChatTabId(fileId, workspaceId);
		return normalizeActiveTab(chatsAreInTab, activeChatId);
	};

	const setTabChats = (fileId: string, workspaceId: string, tabs: ChatTab[]) => {
		if (!browser) {
			return;
		}

		const key = constructTabsRememberidIdKey(fileId, workspaceId);
		const tabIds = normalizeTabIds(tabs.map(tab => tab.id));
		localStorage.setItem(key, JSON.stringify(tabIds));

		const activeTabId = tabs.find(tab => tab.isActive)?.id;
		setActiveChatTabId(fileId, workspaceId, activeTabId);

		for (const tab of tabs) {
			saveTabSettings(fileId, workspaceId, tab);
		}
	};

	const persistTabsForCurrentScope = (chatTabs: ChatTab[]): ChatTab[] => {
		const normalizedTabs = normalizeActiveTab(chatTabs);
		all.set(normalizedTabs);

		const currentScope = getCurrentScope();
		if (currentScope) {
			setTabChats(currentScope.fileId, currentScope.workspaceId, normalizedTabs);
		}

		return normalizedTabs;
	};

	const updateScopeKey = (() => {
		let previousScopeKey: string | undefined;

		return () => {
			const currentScope = getCurrentScope();
			const scopeKey = currentScope
				? `${currentScope.workspaceId}:${currentScope.fileId}`
				: undefined;

			if (scopeKey !== previousScopeKey) {
				all.set([]);
				previousScopeKey = scopeKey;
			}
		};
	})();

	const restoreTabsForCurrentScope = (persistRestoredTabs: boolean = false): ChatTab[] => {
		const currentScope = getCurrentScope();
		if (!currentScope) {
			all.set([]);
			return [];
		}

		const loadedChats = get(loadedChatsOfWorkspaceFile);
		if (!loadedChats.length) {
			all.set([]);
			return [];
		}

		const rememberedTabIds = loadTabIds(currentScope.fileId, currentScope.workspaceId);
		const restoredTabs = loadTabChats(rememberedTabIds, currentScope.fileId, currentScope.workspaceId);

		all.set(restoredTabs);

		if (persistRestoredTabs) {
			setTabChats(currentScope.fileId, currentScope.workspaceId, restoredTabs);
		}

		return restoredTabs;
	};

	if (browser) {
		queueMicrotask(() => {
			selectedFile.subscribe(() => {
				updateScopeKey();
			});
		
			selectedWorkspace.subscribe(() => {
				updateScopeKey();
			});
		
			// Reopen remembered tabs after chats for the selected file are loaded.
			loadedChatsOfWorkspaceFile.subscribe(() => {
				restoreTabsForCurrentScope();
			});
		});
	}

	return {
		...all,
		update(updater: Updater<ChatTab[]>) {
			all.update(chatTabs => {
				const updatedTabs = updater(chatTabs);
				const normalizedTabs = normalizeActiveTab(updatedTabs);

				const currentScope = getCurrentScope();
				if (currentScope) {
					setTabChats(currentScope.fileId, currentScope.workspaceId, normalizedTabs);
				}

				return normalizedTabs;
			});
		},
		set(chatTabs: ChatTab[]) {
			persistTabsForCurrentScope(chatTabs);
		},
		/** Opens selected file chat in tabs and marks this chat as active */
		openChatTab(chatId: string): ChatTab | undefined {
			const chatIdReady = chatId.trim();
			if (!chatIdReady.length) {
				return undefined;
			}

			const currentTabs = get(all);
			if (currentTabs.some(tab => tab.id === chatIdReady)) {
				const tabsWithOneActive = normalizeActiveTab(currentTabs, chatIdReady);
				const persistedTabs = persistTabsForCurrentScope(tabsWithOneActive);
				return persistedTabs.find(tab => tab.id === chatIdReady);
			}

			const chatFromLoadedChats = get(loadedChatsOfWorkspaceFile).find(chat => chat.id === chatIdReady);
			if (!chatFromLoadedChats) {
				return undefined;
			}

			const newTab = createChatTabFromLoadedChat(chatFromLoadedChats);
			const withNewTab = normalizeActiveTab([...currentTabs, newTab], chatIdReady);
			const persistedTabs = persistTabsForCurrentScope(withNewTab);

			return persistedTabs.find(tab => tab.id === chatIdReady);
		},
		/** Removes opened chat tab from tabs view */
		removeTab(chatId: string): boolean {
			const currentTabs = get(all);
			const removedTabIndex = currentTabs.findIndex(tab => tab.id === chatId);
			if (removedTabIndex < 0) {
				return false;
			}

			const removedTab = currentTabs[removedTabIndex];
			const tabsAfterRemoval = currentTabs.filter(tab => tab.id !== chatId);

			let nextActiveTabId: string | undefined;
			if (removedTab.isActive) {
				nextActiveTabId = tabsAfterRemoval[Math.max(0, removedTabIndex - 1)]?.id
					?? tabsAfterRemoval[0]?.id;
			}

			const normalizedTabs = normalizeActiveTab(tabsAfterRemoval, nextActiveTabId);
			persistTabsForCurrentScope(normalizedTabs);
			return true;
		},
		/** Use to select new chat as active when user select this chat */
		setActive(chatId: string): boolean {
			const currentTabs = get(all);
			if (!currentTabs.some(tab => tab.id === chatId)) {
				return false;
			}

			const tabsWithOneActive = normalizeActiveTab(currentTabs, chatId);
			persistTabsForCurrentScope(tabsWithOneActive);
			return true;
		},
		/**
		 * Use to load all chats
		 * Use this after-when user has loaded selected file chats
		*/
		loadChatsToStore() {
			restoreTabsForCurrentScope(true);
		}
	}
})();

const CHAT_MODE_TRANSLATIONS: Record<AIChatMode, string> = {
	"regular-ask": "Ask",
	"document-manipulation": "Document Manipulation",
	"tasks-creation": "Create Document Tasks"
};

const normalizeModeCandidate = (modeCandidate: AIChatMode): AIChatMode => {
	if (modeCandidate === "regular-ask" || modeCandidate === "document-manipulation" || modeCandidate === "tasks-creation") {
		return modeCandidate;
	}

	return "regular-ask";
};

const getActiveTabFromState = (tabs: ChatTab[]): ChatTab | undefined => {
	return tabs.find(tab => tab.isActive) ?? tabs[0];
};

const cloneSelectedContext = (tab?: ChatTab): ChatTab["selectedContext"] => {
	return {
		desktopFiles: Array.isArray(tab?.selectedContext?.desktopFiles)
			? [...tab!.selectedContext.desktopFiles]
			: [],
		editorFiles: Array.isArray(tab?.selectedContext?.editorFiles)
			? [...tab!.selectedContext.editorFiles]
			: [],
		networkUrls: Array.isArray(tab?.selectedContext?.networkUrls)
			? [...tab!.selectedContext.networkUrls]
			: [],
		aiAnswers: Array.isArray(tab?.selectedContext?.aiAnswers)
			? [...tab!.selectedContext.aiAnswers]
			: []
	};
};

const createChatTabId = (): string => {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}

	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const reorderTabsByPosition = (
	tabs: ChatTab[],
	draggedChatId: string,
	targetChatId: string,
	position: "before" | "after"
): ChatTab[] => {
	if (draggedChatId === targetChatId) {
		return tabs;
	}

	const sourceIndex = tabs.findIndex(tab => tab.id === draggedChatId);
	const targetIndex = tabs.findIndex(tab => tab.id === targetChatId);
	if (sourceIndex < 0 || targetIndex < 0) {
		return tabs;
	}

	const nextTabs = [...tabs];
	const [draggedTab] = nextTabs.splice(sourceIndex, 1);
	if (!draggedTab) {
		return tabs;
	}

	const adjustedTargetIndex = sourceIndex < targetIndex
		? targetIndex - 1
		: targetIndex;
	const insertionIndex = position === "before"
		? adjustedTargetIndex
		: adjustedTargetIndex + 1;

	nextTabs.splice(insertionIndex, 0, draggedTab);
	return nextTabs;
};

export type AIChatThread = ChatTab;

type RightSideStripeChatState = {
	chats: ChatTab[];
	selectedChatId?: string;
	isLoading: boolean;
};

const toRightSideStripeState = (tabs: ChatTab[], isLoading: boolean): RightSideStripeChatState => {
	const activeTab = getActiveTabFromState(tabs);

	return {
		chats: [...tabs],
		selectedChatId: activeTab?.id,
		isLoading
	};
};

export const rightSideStripeChat = (() => {
	const { ...all } = writable<RightSideStripeChatState>(toRightSideStripeState([], false));

	if (browser) {
		let latestTabs = get(chatStripeTabsOfWorkspaceFile);
		let latestIsLoading = get(isLoadedChatsOfWorkspaceFileLoading);
	
		chatStripeTabsOfWorkspaceFile.subscribe(chatTabs => {
			latestTabs = chatTabs;
			all.set(toRightSideStripeState(latestTabs, latestIsLoading));
		});
	
		isLoadedChatsOfWorkspaceFileLoading.subscribe(isLoading => {
			latestIsLoading = isLoading;
			all.set(toRightSideStripeState(latestTabs, latestIsLoading));
		});
	}

	return {
		...all,
		setSelectedChatId(chatId: string): boolean {
			return chatStripeTabsOfWorkspaceFile.setActive(chatId);
		},
		createChat(modeCandidate: AIChatMode, titleCandidate?: string): string {
			const selectedMode = normalizeModeCandidate(modeCandidate);
			const chatTabs = get(chatStripeTabsOfWorkspaceFile);
			const activeTab = getActiveTabFromState(chatTabs);
			const user = get(userProfile);
			if (!user) {
				throw('Cannot create user since his profile isn\'t specified');
			}

			const chatTitle = typeof titleCandidate === "string" && titleCandidate.trim().length > 0
				? titleCandidate.trim()
				: `${CHAT_MODE_TRANSLATIONS[selectedMode]} chat`;

			const nowIso = new Date();
			const newChatTab = {
				...(activeTab ? { ...activeTab } : {}),
				id: createChatTabId(),
				chatName: chatTitle,
				createdAt: nowIso,
				messages: [],
				selectedMode,
				selectedModel: activeTab?.selectedModel,
				selectedContext: cloneSelectedContext(activeTab),
				selectedMCPServers: Array.isArray(activeTab?.selectedMCPServers)
					? [...activeTab!.selectedMCPServers]
					: [],
				isActive: true,
				createdByAuthor: user,
				collaborators: [user],
				workspaceId: get(selectedWorkspace)?.id!,
				fileId: get(selectedFile)?.id!
			} satisfies ChatTab;

			chatStripeTabsOfWorkspaceFile.update(tabs => {
				return [...tabs, newChatTab];
			});

			return newChatTab.id;
		},
		reorderChats(draggedChatId: string, targetChatId: string, position: "before" | "after" = "after") {
			if (!draggedChatId || !targetChatId) {
				return;
			}

			chatStripeTabsOfWorkspaceFile.update(chatTabs => {
				return reorderTabsByPosition(chatTabs, draggedChatId, targetChatId, position);
			});
		},
		removeChat(chatId: string): boolean {
			return chatStripeTabsOfWorkspaceFile.removeTab(chatId);
		}
	};
})();

type EditorAIChatState = {
	textFieldMode: AIChatMode;
};

export const editorAIChat = (() => {
	const { ...all } = writable<EditorAIChatState>({
		textFieldMode: "regular-ask"
	});

	if (browser) {
		chatStripeTabsOfWorkspaceFile.subscribe(chatTabs => {
			const activeTab = getActiveTabFromState(chatTabs);
			if (!activeTab) {
				return;
			}
	
			const selectedMode = normalizeModeCandidate(activeTab.selectedMode);
			all.update(state => {
				if (state.textFieldMode === selectedMode) {
					return state;
				}
	
				return {
					...state,
					textFieldMode: selectedMode
				};
			});
		});
	}

	return {
		...all,
		getTextFieldModeTranslation(modeCandidate: AIChatMode): string {
			const selectedMode = normalizeModeCandidate(modeCandidate);
			return CHAT_MODE_TRANSLATIONS[selectedMode];
		},
		setTextFieldMode(modeCandidate: AIChatMode) {
			const selectedMode = normalizeModeCandidate(modeCandidate);

			all.update(state => {
				if (state.textFieldMode === selectedMode) {
					return state;
				}

				return {
					...state,
					textFieldMode: selectedMode
				};
			});

			chatStripeTabsOfWorkspaceFile.update(chatTabs => {
				const activeTab = getActiveTabFromState(chatTabs);
				if (!activeTab) {
					return chatTabs;
				}

				return chatTabs.map(chatTab => {
					if (chatTab.id !== activeTab.id) {
						return chatTab;
					}

					return {
						...chatTab,
						selectedMode
					};
				});
			});
		}
	};
})();

/**
 * This set with answers is utilized in ai chat
 * New file selected loads the context for specific file
 */
export const selectedChatAnswerIds = (() => {
	const { ...all } = writable<string[]>();

	return {
		...all,
		isSelected(answerId: string) {
			return get(all).some(answerIdLocal => answerIdLocal === answerId);
		},
		selectAnswer(fileId: string, answer: File.FileAI.AIAnswer, multiplySameAnswer: boolean = false) {
			const answers = get(all);

			// Prevents multiplication of save answer
			if (!multiplySameAnswer && answers.some(answerId => answerId === answer.id)) {
				return;
			}
			
			// Save for store has selected files
			SelectedChatAnswersContext.addNewAnswerForFile(fileId, answer.id);
			
			// Update the file
			all.update(answers => {
				return [
					...answers.map(answerId => answerId),
					answer.id
				];
			})
		},
		/** Use to setup saved context for current file */
		loadCurrentFile(fileId: string) {
			const loaded = SelectedChatAnswersContext.loadForFile(fileId);
			all.set(loaded);
		},
		/** Remove the file specific answer */
		removeCurrentFileAnswerId(answerId: string): boolean {
			const selectedFileLocal = get(selectedFile);
			if (!selectedFileLocal) {
				return false;
			}

			const foundAnswerIndex = get(all).some(answerCheckId => answerCheckId === answerId);
			if (foundAnswerIndex) {
				//
				all.update(answersLocal => {
					// Update locally
					const filesWithoutRemoved = answersLocal.filter(answerIdLocal => answerIdLocal !== answerId);

					// Save delete operation
					SelectedChatAnswersContext.saveAnswers(selectedFileLocal.id, filesWithoutRemoved);

					//
					return filesWithoutRemoved;
				});
				
				//
				return true;
			}
			
			return false;
		},
		/** Get AI Answer file id */
		retriveCurrentFileAnswer(answerId: string, autoRemoveNonExistsing: boolean = false) {
			const selectedFileLocal = get(selectedFile);
			const foundAnswersCompundListless = selectedFileLocal?.lists.flatMap(list => list.items);
			const withAllAnswersCompount = foundAnswersCompundListless?.flatMap(answer => answer.answers ?? []);

			const seekFn: (answer: File.FileAI.AIAnswer) => void = answer => answer.id === answerId;
			const foundAnswer = withAllAnswersCompount?.find(seekFn);
			if (autoRemoveNonExistsing && !foundAnswer) {
				const foundAnswerIndex = withAllAnswersCompount?.findIndex(seekFn);

				if (foundAnswerIndex && foundAnswerIndex > -1) {
					withAllAnswersCompount?.splice(foundAnswerIndex, 1);

					// Save result
					const answerIdsList = withAllAnswersCompount?.map(answer => answer.id) ?? [];
					SelectedChatAnswersContext.saveAnswers(selectedFileLocal?.id!, answerIdsList);
				}

				return undefined;
			}

			return foundAnswer;
		}
	}
})();

export class SelectedAnswerFromChatContext {
	static EventName = "selected-right-stripe-answer";

	static listen(listener: (answerId: string) => void | Promise<void>) {
		document.addEventListener(SelectedAnswerFromChatContext.EventName, (ev: Event) => {
			const cev = ev as CustomEvent<string>;
			const answerId = cev.detail;
			listener(answerId);
		});
	}

	static emit(answerId: string) {
		document.dispatchEvent(
			new CustomEvent(SelectedAnswerFromChatContext.EventName, {
				detail: answerId
			})
		);
	}
}

export class SelectedChatAnswersContext {
	static KeyName = "selectedFileChatAnswers";
	
	static constructTabsRememberidIdKey(fileId: string) {
		return `${SelectedChatAnswersContext.KeyName}:${fileId}`;
	}
	
	static loadForFile(fileId: string): string[] {
		const answersKeyValue = localStorage.getItem(
			SelectedChatAnswersContext.constructTabsRememberidIdKey(fileId)
		);

		if (!answersKeyValue) {
			return [];
		}

		try {
			const parsed = JSON.parse(answersKeyValue) as string[];

			if (!(parsed instanceof Array)) {
				throw("AI Answers has to be the array");
			}

			return parsed;
		}
		catch {
			return [];
		}
	}

	static addNewAnswerForFile(fileId: string, answerId: string) {
		const loaded = SelectedChatAnswersContext.loadForFile(fileId);
		const updated = [...loaded, answerId];

		// LocalStorage
		localStorage.setItem(
			SelectedChatAnswersContext.constructTabsRememberidIdKey(fileId),
			JSON.stringify(updated)
		);
	}

	static saveAnswers(fileId: string, answerIdsList: string[]) {
		localStorage.setItem(
			SelectedChatAnswersContext.constructTabsRememberidIdKey(fileId),
			JSON.stringify(answerIdsList)
		);
	}
}
