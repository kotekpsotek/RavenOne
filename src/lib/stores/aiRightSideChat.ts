import { derived, get, writable, type Updater } from "svelte/store";
import { selectedFile, selectedModel } from "./files";
import { browser } from "$app/environment";
import { chatServiceConnection, loadChatsFromFileRequest } from "$lib/sideStripe/rightStripeChat/connections";
import { selectedWorkspace } from "./workspace";
import { isChatSideStripeSelected, isFileListSideStripeSelected } from "./selectedSideStripes";
import { userProfile } from "./user";
import { setAlert } from "$lib/utils/alert";
import type { File } from "@ravenlens/shared";
import type { AIChatMode, ChatTab } from "@ravenlens/shared/chat-ai/frontend";
import type { AIChatModel, BackendChatPopulated, DownloadChat, MessageOutput, MessageUserPrompt, PromptProcessing, SelectedTextRangeContext } from "@ravenlens/shared/chat-ai/backend/schema";
import type { AIAgentOutputMessage } from "../../../../../packages/shared/dist/types/chat-ai/universal";

export const isLoadedChatsOfWorkspaceFileLoading = writable<boolean>(false);

type ProcessingChatsState = Record<string, PromptProcessing>;

type ChatScope = {
	fileId: string;
	workspaceId: string;
};

type ChatPresenceMember = {
	socketId: string;
	user: {
		id: string;
	};
};

const pickPromptProcessing = (chatCandidate: unknown): PromptProcessing | undefined => {
	if (!chatCandidate || typeof chatCandidate !== "object") {
		return undefined;
	}

	if (!("promptIdProcessing" in chatCandidate)) {
		return undefined;
	}

	const processing = (chatCandidate as { promptIdProcessing?: unknown }).promptIdProcessing;
	if (!processing || typeof processing !== "object") {
		return undefined;
	}

	return processing as PromptProcessing;
};

const collectProcessingChats = (chats: unknown[]): ProcessingChatsState => {
	const nextState: ProcessingChatsState = {};

	for (const chat of chats) {
		if (!chat || typeof chat !== "object") {
			continue;
		}

		const chatId = (chat as { id?: unknown }).id;
		if (typeof chatId !== "string" || !chatId.trim().length) {
			continue;
		}

		const processing = pickPromptProcessing(chat);
		if (!processing) {
			continue;
		}

		nextState[chatId] = processing;
	}

	return nextState;
};

export const processingChatsOfWorkspaceFile = (() => {
	const { ...all } = writable<ProcessingChatsState>({});

	return {
		...all,
		replaceAll(nextState: ProcessingChatsState) {
			all.set({ ...nextState });
		},
		clear() {
			all.set({});
		},
		startProcessing(chatId: string, promptMessageId: string, userSocketId: string, userId: string) {
			all.update(state => ({
				...state,
				[chatId]: {
					promptId: promptMessageId,
					promptMessageId,
					initializedByMember: {
						userId,
						socketId: userSocketId
					}
				}
			}));
		},
		stopProcessing(chatId: string) {
			all.update(state => {
				if (!(chatId in state)) {
					return state;
				}

				const nextState = { ...state };
				delete nextState[chatId];
				return nextState;
			});
		},
		setPromptId(chatId: string, promptId: string) {
			if (!chatId.trim().length || !promptId.trim().length) {
				return false;
			}

			let wasUpdated = false;
			all.update(state => {
				const current = state[chatId];
				if (!current || current.promptId === promptId) {
					return state;
				}

				wasUpdated = true;
				return {
					...state,
					[chatId]: {
						...current,
						promptId
					}
				};
			});

			return wasUpdated;
		},
		syncToChatIds(chatIds: string[]) {
			all.update(state => {
				const nextState = Object.fromEntries(
					Object.entries(state).filter(([chatId]) => chatIds.includes(chatId))
				);

				return nextState;
			});
		},
		findChatIdByPromptId(promptId: string): string | undefined {
			if (!promptId.trim().length) {
				return undefined;
			}

			return Object.entries(get(all)).find(([, processing]) => processing.promptId === promptId)?.[0];
		},
		isChatProcessing(chatId: string): boolean {
			return Boolean(get(all)[chatId]);
		}
	};
})();

const normalizeLoadedChat = (chat: BackendChatPopulated | DownloadChat): DownloadChat => {
	const inFileCollaborators = Array.isArray((chat as DownloadChat).inFileCollaborators)
		? [...(chat as DownloadChat).inFileCollaborators]
		: [...chat.collaborators.map(collaborator => ({ ...collaborator, isActive: false as const }))];

	return {
		...chat,
		inFileCollaborators
	};
};

const normalizeScopeId = (idCandidate: unknown): string | undefined => {
	if (typeof idCandidate !== "string") {
		return undefined;
	}

	const normalizedId = idCandidate.trim();
	return normalizedId.length ? normalizedId : undefined;
};

const resolveWorkspaceScopeId = (
	selectedFileLocal?: File.File.File,
	selectedWorkspaceLocal?: { id?: string }
): string | undefined => {
	const fileWorkspaceId = normalizeScopeId((selectedFileLocal as { createdByAuthorId?: unknown } | undefined)?.createdByAuthorId);
	if (fileWorkspaceId) {
		return fileWorkspaceId;
	}

	const selectedWorkspaceId = normalizeScopeId(selectedWorkspaceLocal?.id);
	if (selectedWorkspaceId) {
		return selectedWorkspaceId;
	}

	return undefined;
};

const getCurrentChatScope = (): ChatScope | undefined => {
	const selectedFileLocal = get(selectedFile);
	const selectedWorkspaceLocal = get(selectedWorkspace);
	const workspaceId = resolveWorkspaceScopeId(selectedFileLocal, selectedWorkspaceLocal);

	if (!selectedFileLocal || !workspaceId) {
		return undefined;
	}

	return {
		fileId: selectedFileLocal.id,
		workspaceId
	};
};

const getCurrentChatScopeKey = (): string | undefined => {
	const scope = getCurrentChatScope();
	if (!scope) {
		return undefined;
	}

	return `${scope.workspaceId}:${scope.fileId}`;
};

const areChatScopesEqual = (left?: ChatScope, right?: ChatScope): boolean => {
	if (!left && !right) {
		return true;
	}

	if (!left || !right) {
		return false;
	}

	return left.fileId === right.fileId && left.workspaceId === right.workspaceId;
};

const syncChatMemberPresence = <T extends { collaborators: unknown[]; inFileCollaborators?: unknown[] }>(
	chat: T,
	member: ChatPresenceMember,
	isActive: boolean
): T => {
	const collaboratorId = member.user.id;
	if (!collaboratorId) {
		return chat;
	}

	const collaborators = [...(chat.collaborators as Array<{ id: string } & Record<string, unknown>> )];
	const inFileCollaborators = Array.isArray(chat.inFileCollaborators)
		? [...(chat.inFileCollaborators as Array<{ id: string; isActive?: boolean } & Record<string, unknown>>)]
		: [];

	const nextCollaborators = collaborators.some(collaborator => collaborator.id === collaboratorId)
		? collaborators.map(collaborator => collaborator.id === collaboratorId ? { ...collaborator, ...member.user } : collaborator)
		: [...collaborators, member.user as unknown as { id: string } & Record<string, unknown>];
	const collaboratorIndex = inFileCollaborators.findIndex(collaborator => collaborator.id === collaboratorId);

	if (collaboratorIndex >= 0) {
		inFileCollaborators[collaboratorIndex] = {
			...inFileCollaborators[collaboratorIndex],
			...member.user,
			isActive
		};
	}
	else {
		inFileCollaborators.push({
			...(member.user as unknown as { id: string } & Record<string, unknown>),
			isActive
		});
	}

	return {
		...chat,
		collaborators: nextCollaborators as T["collaborators"],
		inFileCollaborators: inFileCollaborators as T["inFileCollaborators"]
	};
};

/** TODO: Each new user / collaborator change has to be annotated withing this storage to keep user marked as editors */
/** It's the set with backend loaded chats */
export const loadedChatsOfWorkspaceFile = (() => {
	const { ...all } = writable<DownloadChat[]>([]);
	let latestLoadRequestId = 0;
	let loadedScopeKey: string | undefined;

	const getCurrentScope = (): { fileId: string; workspaceId: string } | undefined => {
		const selectedFileLocal = get(selectedFile);
		const selectedWorkspaceLocal = get(selectedWorkspace);
		const workspaceId = resolveWorkspaceScopeId(selectedFileLocal, selectedWorkspaceLocal);

		if (!selectedFileLocal || !workspaceId) {
			return undefined;
		}

		return {
			fileId: selectedFileLocal.id,
			workspaceId
		};
	};

	const loadChatsForCurrentScope = async (): Promise<void> => {
		const chatStripeSelected = get(isChatSideStripeSelected);
		const currentScope = getCurrentScope();

		if (!chatStripeSelected || !currentScope) {
			latestLoadRequestId += 1;
			isLoadedChatsOfWorkspaceFileLoading.set(false);
			loadedScopeKey = undefined;
			processingChatsOfWorkspaceFile.clear();
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

		const chatsFromBackendRaw = await loadChatsFromFileRequest(
			currentScope.fileId,
			currentScope.workspaceId
		);
		const processingChats = collectProcessingChats(chatsFromBackendRaw as unknown[]);
		const chatsFromBackend: DownloadChat[] = chatsFromBackendRaw.map(normalizeLoadedChat);

		if (requestId !== latestLoadRequestId) {
			return;
		}

		loadedScopeKey = scopeKey;
		processingChatsOfWorkspaceFile.replaceAll(processingChats);
		all.set(chatsFromBackend);
		isLoadedChatsOfWorkspaceFileLoading.set(false);
	};

	if (browser) {
		// Delay subscription to avoid TDZ circular dependency issues with selectedFile
		queueMicrotask(() => {
			let previousScopeKey = getCurrentChatScopeKey();
			const onScopeMaybeChanged = () => {
				const nextScopeKey = getCurrentChatScopeKey();
				if (nextScopeKey === previousScopeKey) {
					return;
				}

				previousScopeKey = nextScopeKey;
				void loadChatsForCurrentScope();
			};

			selectedFile.subscribe(() => {
				onScopeMaybeChanged();
			});

			selectedWorkspace.subscribe(() => {
				onScopeMaybeChanged();
			});
		
			isChatSideStripeSelected.subscribe(() => {
				void loadChatsForCurrentScope();
			});

			void loadChatsForCurrentScope();
		});
	}
	
	// 
	return {
		...all,
		updateChatById(chatId: string, updater: (chat: DownloadChat) => DownloadChat): boolean {
			let wasUpdated = false;

			all.update(chats => {
				return chats.map(chat => {
					if (chat.id !== chatId) {
						return chat;
					}

					wasUpdated = true;
					return updater(chat);
				});
			});

			return wasUpdated;
		},
		/**
		 * Role:
		 * 1. Add chat to storage
		 * 2. It doesn't connect with backend to make the chat on backend use `rightSideStripeChat.createChat` function
		 */
		addChat(chatCandidate: BackendChatPopulated | DownloadChat | ChatTab): DownloadChat {
			const chat = normalizeLoadedChat(chatCandidate as BackendChatPopulated | DownloadChat);

			all.update(chats => {
				const chatIndex = chats.findIndex(chatLocal => chatLocal.id === chat.id);
				if (chatIndex < 0) {
					return [...chats, chat];
				}

				const updatedChats = [...chats];
				updatedChats[chatIndex] = chat;
				return updatedChats;
			});

			return chat;
		}
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
		if (modeCandidate === "regular-ask" || modeCandidate === "tasks-manipulation" || modeCandidate === "document-manipulation") {
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
		const workspaceId = resolveWorkspaceScopeId(selectedFileLocal, selectedWorkspaceLocal);

		if (!selectedFileLocal || !workspaceId) {
			return undefined;
		}

		return {
			fileId: selectedFileLocal.id,
			workspaceId
		};
	};

	const normalizeTabIds = (ids: string[]): string[] => {
		const normalizedIds = ids
			.map(id => (typeof id === "string" ? id.trim() : ""))
			.filter((id): id is string => id.length > 0);

		return [...new Set(normalizedIds)];
	};

	const getPersistableTabsSignature = (tabs: ChatTab[]): string => {
		const normalizedTabs = normalizeActiveTab(tabs);
		const persistableTabs = normalizedTabs.map(tab => {
			const normalizedSettings = normalizeTabSettings(undefined, tab);

			return {
				id: tab.id,
				isActive: Boolean(tab.isActive),
				selectedMode: normalizedSettings.selectedMode,
				selectedModel: normalizedSettings.selectedModel,
				selectedContext: normalizedSettings.selectedContext,
				selectedMCPServers: normalizedSettings.selectedMCPServers
			};
		});

		return JSON.stringify(persistableTabs);
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

	// TODO: Call to backend to create the chat and then return the type
	const createChatTabFromLoadedChat = (chat: DownloadChat): ChatTab => {
		const asMaybeTab = chat as Partial<ChatTab>;
		return {
			...chat,
			inFileCollaborators: [...asMaybeTab.inFileCollaborators ?? []],
			selectedMode: normalizeSelectedMode(asMaybeTab.selectedMode),
			selectedModel: normalizeSelectedModel(asMaybeTab.selectedModel),
			selectedContext: normalizeSelectedContext(asMaybeTab.selectedContext),
			selectedMCPServers: normalizeSelectedMCPServers(asMaybeTab.selectedMCPServers)
		};
	};

	const loadTabChats = (tabsId: string[], fileId: string, workspaceId: string): ChatTab[] => {
		const fileChatsStateLocal = get(loadedChatsOfWorkspaceFile);
		if (!fileChatsStateLocal.length) {
			return [];
		}

		if (!tabsId.length) {
			const defaultTab = createChatTabFromLoadedChat(fileChatsStateLocal[0]);
			return normalizeActiveTab([mergeTabWithStoredSettings(defaultTab, fileId, workspaceId)]);
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

		if (!chatsAreInTab.length) {
			const defaultTab = createChatTabFromLoadedChat(fileChatsStateLocal[0]);
			return normalizeActiveTab([mergeTabWithStoredSettings(defaultTab, fileId, workspaceId)]);
		}

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

	const restoreTabsIfReady = (): ChatTab[] => {
		if (get(isLoadedChatsOfWorkspaceFileLoading) || !get(isChatSideStripeSelected)) {
			return [];
		}

		return restoreTabsForCurrentScope();
	};

	const restoreTabsForCurrentScope = (persistRestoredTabs: boolean = false): ChatTab[] => {
		const currentScope = getCurrentScope();
		if (!currentScope) {
			all.set([]);
			return [];
		}

		const isLoading = get(isLoadedChatsOfWorkspaceFileLoading);
		if (isLoading) {
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
			let previousScopeKey = getCurrentChatScopeKey();
			const onScopeMaybeChanged = () => {
				const nextScopeKey = getCurrentChatScopeKey();
				if (nextScopeKey === previousScopeKey) {
					return;
				}

				previousScopeKey = nextScopeKey;
				updateScopeKey();
				restoreTabsIfReady();
			};

			selectedFile.subscribe(() => {
				onScopeMaybeChanged();
			});

			selectedWorkspace.subscribe(() => {
				onScopeMaybeChanged();
			});

			// Restore tabs only after backend loading completes.
			isLoadedChatsOfWorkspaceFileLoading.subscribe(isLoading => {
				if (!isLoading) {
					restoreTabsIfReady();
				}
			});

			isChatSideStripeSelected.subscribe(() => {
				restoreTabsIfReady();
			});

			// User profile may load after chats; retry so draft fallback can be created.
			userProfile.subscribe(() => {
				if (!get(isLoadedChatsOfWorkspaceFileLoading)) {
					restoreTabsForCurrentScope();
				}
			});

			updateScopeKey();
			restoreTabsIfReady();
		});
	}

	return {
		...all,
		update(updater: Updater<ChatTab[]>) {
			all.update(chatTabs => {
				const updatedTabs = updater(chatTabs);
				const normalizedTabs = normalizeActiveTab(updatedTabs);

				const currentScope = getCurrentScope();
				if (currentScope && getPersistableTabsSignature(chatTabs) !== getPersistableTabsSignature(normalizedTabs)) {
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

			// Always some tab has to be open
			if (tabsAfterRemoval.length === 0) {
				return false;
			}
			
			//
			let nextActiveTabId: string | undefined;
			if (removedTab.isActive) {
				nextActiveTabId = tabsAfterRemoval[Math.max(0, removedTabIndex - 1)]?.id
					?? tabsAfterRemoval[0]?.id;
			}

			const normalizedTabs = normalizeActiveTab(tabsAfterRemoval, nextActiveTabId);
			persistTabsForCurrentScope(normalizedTabs);

			ChatTabPromptAreaSaving.clearPrompt(chatId);

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
		updateChatTabById(chatId: string, updater: (chatTab: ChatTab) => ChatTab): boolean {
			let wasUpdated = false;

			chatStripeTabsOfWorkspaceFile.update((chatTabs) => {
				return chatTabs.map((chatTab) => {
					if (chatTab.id !== chatId) {
						return chatTab;
					}

					wasUpdated = true;
					return updater(chatTab);
				});
			});

			return wasUpdated;
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

export const CHAT_MODE_TRANSLATIONS: Record<AIChatMode, string> = {
	"regular-ask": "Ask",
	"document-manipulation": "Document Manipulation",
	"tasks-manipulation": "Create Document Tasks"
};

const normalizeModeCandidate = (modeCandidate: AIChatMode): AIChatMode => {
	if (modeCandidate === "regular-ask" || modeCandidate === "document-manipulation" || modeCandidate === "tasks-manipulation") {
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

interface RightSideStripeChatState {
	selectedChatId?: string;
	isLoading: boolean;
};

interface AppendedPromptMessageResult {
	chatId: string;
	promptIndex: number;
	promptMessage: MessageUserPrompt;
};

const REASONING_FLUSH_INTERVAL_MS = 80;
const queuedReasoningByChatId = new Map<string, MessageOutput["reasoning"]>();
let queuedReasoningFlushTimeout: ReturnType<typeof setTimeout> | undefined;

const flushQueuedReasoningUpdates = (chatId?: string) => {
	const updatesToApply = chatId
		? (queuedReasoningByChatId.has(chatId) ? new Map([[chatId, queuedReasoningByChatId.get(chatId)!]]) : new Map<string, MessageOutput["reasoning"]>())
		: new Map(queuedReasoningByChatId);

	if (!updatesToApply.size) {
		return;
	}

	for (const queuedChatId of updatesToApply.keys()) {
		queuedReasoningByChatId.delete(queuedChatId);
	}

	if (queuedReasoningFlushTimeout && (chatId === undefined || queuedReasoningByChatId.size === 0)) {
		clearTimeout(queuedReasoningFlushTimeout);
		queuedReasoningFlushTimeout = undefined;
	}

	chatStripeTabsOfWorkspaceFile.update(chatTabs => {
		return chatTabs.map(chatTab => {
			const queuedReasoning = updatesToApply.get(chatTab.id);
			if (!queuedReasoning?.length) {
				return chatTab;
			}

			const nextMessages = [...chatTab.messages];
			for (let messageIndex = nextMessages.length - 1; messageIndex >= 0; messageIndex -= 1) {
				const message = nextMessages[messageIndex];
				if (message.messageType !== "message-user-output" || !message.isAnswering) {
					continue;
				}

				nextMessages[messageIndex] = {
					...message,
					reasoning: [...message.reasoning, ...queuedReasoning]
				};

				return {
					...chatTab,
					messages: nextMessages
				};
			}

			return chatTab;
		});
	});
};

const scheduleQueuedReasoningFlush = () => {
	if (queuedReasoningFlushTimeout) {
		return;
	}

	queuedReasoningFlushTimeout = setTimeout(() => {
		queuedReasoningFlushTimeout = undefined;
		flushQueuedReasoningUpdates();
	}, REASONING_FLUSH_INTERVAL_MS);
};

const toRightSideStripeState = (tabs: ChatTab[], isLoading: boolean): RightSideStripeChatState => {
	const activeTab = getActiveTabFromState(tabs);

	return {
		selectedChatId: activeTab?.id,
		isLoading
	};
};

/** It's the state of current chat */
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
		setLoading(isLoading: boolean) {
			all.update(state => {
				return {
					...state,
					isLoading
				}
			});
		},
		createDefaultChatName(mode: AIChatMode) {
			return `${editorAIChat.getTextFieldModeTranslation(mode)} chat`
		},
		getChatMessages(chatTab: ChatTab): ChatTab["messages"] {
			if (!Array.isArray(chatTab.messages)) {
				return [];
			}

			return [...chatTab.messages];
		},
		createModelForMessage(chatTab: ChatTab): AIChatModel {
			const selectedModelForTab = chatTab.selectedModel;
			const selectedModelFromStore = get(selectedModel);

			if (selectedModelForTab) {
				return {
					id: selectedModelForTab.model,
					name: selectedModelForTab.model,
					provider: selectedModelForTab.provider,
					weight: 1
				};
			}

			if (selectedModelFromStore) {
				return {
					id: selectedModelFromStore.model,
					name: selectedModelFromStore.model,
					provider: selectedModelFromStore.provider,
					weight: 1
				};
			}

			return {
				id: "gpt-5-mini",
				name: "gpt-5-mini",
				provider: "OpenAI",
				weight: 1
			};
		},
		appendPromptMessage(params: {
			prompt: string;
			promptHTML: string;
			mode: AIChatMode;
		}): AppendedPromptMessageResult | undefined {
			const activeChatLocal = get(activeChat);
			if (!activeChatLocal) {
				return undefined;
			}

			const promptMessage: MessageUserPrompt = {
				id: createChatTabId(),
				time: {
					startAt: new Date()
				},
				messageType: "message-user-prompt",
				messageContentHTML: params.promptHTML,
				model: this.createModelForMessage(activeChatLocal),
				aiChatMode: params.mode,
				context: activeChatLocal.selectedContext,
				mcpSelectedServerNames: [...activeChatLocal.selectedMCPServers],
				isAnswering: true
			};
			const promptIndex = this.getChatMessages(activeChatLocal).length;
			const wasUpdatedMessages = chatStripeTabsOfWorkspaceFile.updateChatTabById(activeChatLocal.id, (chatTab) => {
				return {
					...chatTab,
					messages: [...this.getChatMessages(chatTab), promptMessage]
				};
			});
			const activeUserId = get(userProfile)?.id;
			if (!activeUserId) {
				return undefined;
			}

			// FIXME: Setup real socket.io id
			processingChatsOfWorkspaceFile.startProcessing(activeChatLocal.id, promptMessage.id, "test", activeUserId);

			if (!wasUpdatedMessages) {
				return undefined;
			}

			return {
				chatId: activeChatLocal.id,
				promptIndex,
				promptMessage
			};
		},
		appendOutputMessages(chatId: string, messagesToAppend: MessageOutput[]) {
			chatStripeTabsOfWorkspaceFile.updateChatTabById(chatId, (chatTab) => {
				return {
					...chatTab,
					messages: [...this.getChatMessages(chatTab), ...messagesToAppend]
				};
			});
		},
		upsertOutputMessage(chatId: string, outputMessage: MessageOutput) {
			chatStripeTabsOfWorkspaceFile.updateChatTabById(chatId, (chatTab) => {
				const normalizedOutputMessage = normalizeOutputMessage(outputMessage);
				const messages = this.getChatMessages(chatTab);
				const existingIndex = messages.findIndex(message => {
					return message.messageType === "message-user-output" && message.id === normalizedOutputMessage.id;
				});

				if (existingIndex < 0) {
					return {
						...chatTab,
						messages: [...messages, normalizedOutputMessage]
					};
				}

				const nextMessages = [...messages];
				nextMessages[existingIndex] = normalizedOutputMessage;

				return {
					...chatTab,
					messages: nextMessages
				};
			});
		},
		appendReasoningToLastAnsweringOutput(chatId: string, reasoningPhase: MessageOutput["reasoning"][number]) {
			const queuedReasoning = queuedReasoningByChatId.get(chatId) ?? [];
			queuedReasoningByChatId.set(chatId, [...queuedReasoning, reasoningPhase]);
			scheduleQueuedReasoningFlush();
		},
		flushQueuedReasoning(chatId?: string) {
			flushQueuedReasoningUpdates(chatId);
		},
		markOutputMessageAsError(chatId: string, outputMessageId?: string, errorMessage: string = "Cannot show message because of error while processing") {
			flushQueuedReasoningUpdates(chatId);
			chatStripeTabsOfWorkspaceFile.updateChatTabById(chatId, (chatTab) => {
				const messages = this.getChatMessages(chatTab);
				let wasUpdated = false;
				const nextMessages = messages.map(message => {
					if (message.messageType !== "message-user-output") {
						return message;
					}

					if (outputMessageId && message.id !== outputMessageId) {
						return message;
					}

					wasUpdated = true;
					return {
						...message,
						isAnswering: false,
						isError: errorMessage,
						time: {
							...message.time,
							endAt: new Date()
						}
					};
				});

				if (wasUpdated) {
					return {
						...chatTab,
						messages: nextMessages
					};
				}

				const errorOutputMessage: MessageOutput = {
					id: outputMessageId ?? createChatTabId(),
					time: {
						startAt: new Date(),
						endAt: new Date()
					},
					messageType: "message-user-output",
					messageContentHTML: "",
					model: this.createModelForMessage(chatTab),
					aiChatMode: chatTab.selectedMode,
					reasoning: [],
					isError: errorMessage
				};

				return {
					...chatTab,
					messages: [...messages, errorOutputMessage]
				};
			});
		},
		setSelectedChatId(chatId: string): boolean {
			return chatStripeTabsOfWorkspaceFile.setActive(chatId);
		},
		async createChat(modeCandidate: AIChatMode, titleCandidate?: string): Promise<string | undefined> {
			const selectedMode = normalizeModeCandidate(modeCandidate);
			const chatTabs = get(chatStripeTabsOfWorkspaceFile);
			const activeTab = getActiveTabFromState(chatTabs);
			const user = get(userProfile);
			const selectedFileLocal = get(selectedFile);
			const selectedWorkspaceLocal = get(selectedWorkspace);
			const chatServiceConnectionLocal = get(chatServiceConnection);
			if (!user) {
				setAlert("error", "Chat unavailable", "User profile is required before creating a chat.");
				return undefined;
			}

			if (!selectedFileLocal || !selectedWorkspaceLocal) {
				setAlert("warning", "Chat unavailable", "Select a workspace file before creating a chat.");
				return undefined;
			}

			if (!chatServiceConnectionLocal) {
				setAlert("error", "Chat unavailable", "Chat service connection is not initialized.");
				return undefined;
			}

			const defaultChatName = rightSideStripeChat.createDefaultChatName(selectedMode);
			const chatTitle = typeof titleCandidate === "string" && titleCandidate.trim().length > 0
				? titleCandidate.trim()
				: defaultChatName;
			const createChatResult = await chatServiceConnectionLocal.emitCreateChat(chatTitle);

			if (!createChatResult.success) {
				setAlert("error", "Chat creation failed", createChatResult.reason ?? "Cannot create chat right now.");
				return undefined;
			}

			const nowIso = new Date();
			const newChatTab = {
				...(activeTab ? { ...activeTab } : {}),
				id: createChatResult.chatId,
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
				workspaceId: selectedWorkspaceLocal.id,
				fileId: selectedFileLocal.id,
				inFileCollaborators: [{...user, isActive: true}]
			} satisfies ChatTab;

			// Add chat tab
			chatStripeTabsOfWorkspaceFile.update(tabs => {
				const tabsWithoutActive = tabs.map(tab => ({ ...tab, isActive: false }));
				return [...tabsWithoutActive, newChatTab];
			});

			// Keep list-view source in sync (loadedChatsOfWorkspaceFile).
			loadedChatsOfWorkspaceFile.addChat(newChatTab);

			// 

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
		},
		stopProcessing(chatId: string, markAsStopped: boolean = true): boolean {
			flushQueuedReasoningUpdates(chatId);
			let wasUpdated = false;
			const markMessageAsStopped = <T extends { isAnswering?: boolean; isStopped?: boolean; time: { startAt: Date; endAt?: Date } }>(message: T): T => {
				return {
					...message,
					isAnswering: false,
					isStopped: markAsStopped,
					time: {
						...message.time,
						endAt: new Date()
					}
				};
			};

			chatStripeTabsOfWorkspaceFile.updateChatTabById(chatId, (chatTab) => {
				const nextMessages = [...chatTab.messages];
				let outputMessageIndex = -1;
				let promptMessageIndex = -1;

				for (let messageIndex = nextMessages.length - 1; messageIndex >= 0; messageIndex -= 1) {
					const message = nextMessages[messageIndex];
					if (message.messageType === "message-user-output" && message.isAnswering) {
						outputMessageIndex = messageIndex;
						break;
					}
				}

				for (let messageIndex = nextMessages.length - 1; messageIndex >= 0; messageIndex -= 1) {
					const message = nextMessages[messageIndex];
					if (message.messageType === "message-user-prompt" && message.isAnswering) {
						promptMessageIndex = messageIndex;
						break;
					}
				}

				if (outputMessageIndex >= 0) {
					nextMessages[outputMessageIndex] = markMessageAsStopped(nextMessages[outputMessageIndex]);
				}

				if (promptMessageIndex >= 0) {
					nextMessages[promptMessageIndex] = markMessageAsStopped(nextMessages[promptMessageIndex]);
				}

				if (outputMessageIndex < 0 && promptMessageIndex < 0) {
					for (let messageIndex = nextMessages.length - 1; messageIndex >= 0; messageIndex -= 1) {
						const message = nextMessages[messageIndex];
						if (message.messageType !== "message-user-prompt") {
							continue;
						}

						nextMessages[messageIndex] = markMessageAsStopped(message);
						break;
					}
				}

				wasUpdated = true;
				return {
					...chatTab,
					messages: nextMessages
				};
			});

			loadedChatsOfWorkspaceFile.updateChatById(chatId, (chatTab) => {
				const nextMessages = [...chatTab.messages];
				let wasChatUpdated = false;

				for (let messageIndex = nextMessages.length - 1; messageIndex >= 0; messageIndex -= 1) {
					const message = nextMessages[messageIndex];
					if (message.messageType !== "message-user-prompt" && message.messageType !== "message-user-output") {
						continue;
					}

					if (!message.isAnswering && !message.isStopped) {
						continue;
					}

					nextMessages[messageIndex] = markMessageAsStopped(message as typeof message);
					wasChatUpdated = true;
				}

				if (!wasChatUpdated) {
					return chatTab;
				}

				return {
					...chatTab,
					messages: nextMessages
				};
			});

			if (!wasUpdated) {
				return false;
			}

			processingChatsOfWorkspaceFile.stopProcessing(chatId);
			return true;
		}
	};
})();

if (browser) {
	queueMicrotask(() => {
		let isAutoCreatingChat = false;

		const ensureActiveChatWhenFileListSelected = async () => {
			if (!get(isFileListSideStripeSelected)) {
				return;
			}

			if (!get(isChatSideStripeSelected)) {
				return;
			}

			if (get(isLoadedChatsOfWorkspaceFileLoading)) {
				return;
			}

			const tabs = get(chatStripeTabsOfWorkspaceFile);
			if (tabs.length > 0 && getActiveTabFromState(tabs)) {
				return;
			}

			const firstLoadedChat = get(loadedChatsOfWorkspaceFile)[0];
			if (firstLoadedChat) {
				chatStripeTabsOfWorkspaceFile.openChatTab(firstLoadedChat.id);
				return;
			}

			if (isAutoCreatingChat) {
				return;
			}

			isAutoCreatingChat = true;
			try {
				await rightSideStripeChat.createChat("regular-ask");
			}
			finally {
				isAutoCreatingChat = false;
			}
		};

		isFileListSideStripeSelected.subscribe(() => {
			void ensureActiveChatWhenFileListSelected();
		});

		isChatSideStripeSelected.subscribe(() => {
			void ensureActiveChatWhenFileListSelected();
		});

		isLoadedChatsOfWorkspaceFileLoading.subscribe((isLoading) => {
			if (!isLoading) {
				void ensureActiveChatWhenFileListSelected();
			}
		});

		chatStripeTabsOfWorkspaceFile.subscribe(() => {
			void ensureActiveChatWhenFileListSelected();
		});

		selectedFile.subscribe(() => {
			void ensureActiveChatWhenFileListSelected();
		});

		selectedWorkspace.subscribe(() => {
			void ensureActiveChatWhenFileListSelected();
		});

		void ensureActiveChatWhenFileListSelected();
	});
}

interface EditorAIChatState extends SelectedTextRangeContext {
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
			const selectedTextRanges = Array.isArray(activeTab.selectedContext?.selectedTextRanges)
				? [...activeTab.selectedContext.selectedTextRanges]
				: [];

			all.update(state => {
				const isModeSame = state.textFieldMode === selectedMode;
				const isRangesSame = JSON.stringify(state.selectedTextRanges) === JSON.stringify(selectedTextRanges);

				if (isModeSame && isRangesSame) {
					return state;
				}
	
				return {
					...state,
					textFieldMode: selectedMode,
					selectedTextRanges
				};
			});
		});

		// Delay subscription to avoid circular dependency (ReferenceError: Cannot access 'selectedFile' before initialization)
		queueMicrotask(() => {
			let previousSelectedFileId = get(selectedFile)?.id;

			// Unselect the selected text
			selectedFile.subscribe(() => {
				const currentSelectedFileId = get(selectedFile)?.id;
				if (currentSelectedFileId === previousSelectedFileId) {
					return;
				}

				previousSelectedFileId = currentSelectedFileId;

				all.update(state => ({
					...state,
					selectedTextRanges: []
				}));
			});
		});
	}

	return {
		...all,
		update(updater: (state: EditorAIChatState) => EditorAIChatState) {
			const nextState = updater(get(all));
			all.set(nextState);

			// Persist ranges back to active chat tab context
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
						selectedContext: {
							...(chatTab.selectedContext ?? {}),
							selectedTextRanges: Array.isArray(nextState.selectedTextRanges)
								? [...nextState.selectedTextRanges]
								: []
						}
					};
				});
			});
		},
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
		},
		removeSelectedText(from: number, to: number) {
			this.update((state) => ({
				...state,
				selectedTextRanges: (state.selectedTextRanges ?? []).filter((range) => {
					return range.from !== from || range.to !== to;
				})
			}));
		},
		genSelectedTextId() {
			const editorChatCurrentState = get(all);
			const selectedIndex = editorChatCurrentState.selectedTextRanges?.length ?? 0;
			return `selected-text-${selectedIndex}`;
		},
		selectText({ from, to }: { from: number; to: number; }, text: string) {
			this.update((chatState) => {
				const exists = chatState.selectedTextRanges?.some(r => r.from === from && r.to === to);
				
				if (exists) {
					return chatState;
				}
				
				return {
					...chatState,
					selectedTextRanges: [
						{ 
							id: editorAIChat.genSelectedTextId(),
							from,
							to,
							text
						}
					]
				}
			});
		},
		clearSelectedText() {
			this.update((state) => ({
				...state,
				selectedTextRanges: []
			}));
		},
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

export class ChatTabPromptAreaSaving {
	static StoragePrefix = "chat-prompt-content:";

	static savePrompt(chatId: string, content: string) {
		if (typeof localStorage === "undefined") {
			return;
		}

		localStorage.setItem(`${ChatTabPromptAreaSaving.StoragePrefix}${chatId}`, content);
	}

	static getPrompt(chatId: string): string | null {
		if (typeof localStorage === "undefined") {
			return null;
		}

		return localStorage.getItem(`${ChatTabPromptAreaSaving.StoragePrefix}${chatId}`);
	}

	static clearPrompt(chatId: string) {
		if (typeof localStorage === "undefined") {
			return;
		}

		localStorage.removeItem(`${ChatTabPromptAreaSaving.StoragePrefix}${chatId}`);
	}
}

export const activeChat = derived(chatStripeTabsOfWorkspaceFile, (chatTabs) => {
	return chatTabs.find(chatTab => chatTab.isActive) ?? chatTabs[0];
});

export type AIChatModeType = Extract<AIChatMode, "tasks-manipulation" | "document-manipulation">;
export interface FileChatEditionPreview {
	chatId: string;
	outputMessage: MessageOutput;
	type: AIChatModeType;
}
export const fileChatEditionPreviewShowing = (() => {
	const { ...all } = writable<FileChatEditionPreview | undefined>();

	return {
		...all,
		setFileAsPreviewing(chatId: string, outputMessage: MessageOutput, operationType: AIChatModeType) {
			all.set({ chatId, outputMessage, type: operationType });
		},
		unsetPreviewing() {
			all.set(undefined);
		},
		/**
		 * Return previewing state
		*/
		isFilePreviewing() {
			return get(all) ? true : false;
		},
		/**
		 * Check whether can be message previewing -> more than one messages cannot be previewing
		 * @param chatId 
		 * @param outputMessage 
		 * @param operationType
		 */
		isChatIdPreviewingMessageOutput(chatId: string, outputMessage: MessageOutput, operationType: AIChatModeType) {
			const actualPreview = get(all);
			return actualPreview?.chatId === chatId && actualPreview.outputMessage.id === outputMessage.id && actualPreview.type === operationType;
		}
	}
})();

// Chat Connection to chat service
const updateChatMemberPresence = (chatId: string, member: ChatPresenceMember, isActive: boolean) => {
	loadedChatsOfWorkspaceFile.updateChatById(chatId, chat => syncChatMemberPresence(chat, member, isActive));
	chatStripeTabsOfWorkspaceFile.updateChatTabById(chatId, chatTab => syncChatMemberPresence(chatTab, member, isActive));
};

const updateCurrentUserPresence = (chatId: string, isActive: boolean) => {
	const currentUser = get(userProfile);
	if (!currentUser?.id) {
		return;
	}

	updateChatMemberPresence(chatId, {
		socketId: "self",
		user: currentUser as unknown as ChatPresenceMember["user"]
	}, isActive);
};

const updateChatNameInStores = (chatId: string, chatName: string) => {
	const normalizedChatName = chatName.trim();
	if (!normalizedChatName.length) {
		return;
	}

	loadedChatsOfWorkspaceFile.updateChatById(chatId, chat => ({
		...chat,
		chatName: normalizedChatName
	}));

	chatStripeTabsOfWorkspaceFile.updateChatTabById(chatId, chatTab => ({
		...chatTab,
		chatName: normalizedChatName
	}));
};

const isChatPresentInStores = (chatId: string): boolean => {
	if (!chatId.trim().length) {
		return false;
	}

	const isInLoadedChats = get(loadedChatsOfWorkspaceFile).some(chat => chat.id === chatId);
	if (isInLoadedChats) {
		return true;
	}

	return get(chatStripeTabsOfWorkspaceFile).some(chatTab => chatTab.id === chatId);
};

const hasAnsweringOutputMessage = (chatId: string, outputMessageId?: string): boolean => {
	const chatTab = get(chatStripeTabsOfWorkspaceFile).find(chat => chat.id === chatId);
	if (!chatTab) {
		return false;
	}

	return chatTab.messages.some(message => {
		if (message.messageType !== "message-user-output" || !message.isAnswering) {
			return false;
		}

		if (outputMessageId && message.id !== outputMessageId) {
			return false;
		}

		return true;
	});
};

const isChatActivelyProcessing = (chatId: string, outputMessageId?: string): boolean => {
	return processingChatsOfWorkspaceFile.isChatProcessing(chatId) || hasAnsweringOutputMessage(chatId, outputMessageId);
};

const toValidDate = (value: unknown, fallback: Date = new Date()): Date => {
	const parsedDate = value instanceof Date ? value : new Date(value as string | number);
	return Number.isNaN(parsedDate.getTime()) ? fallback : parsedDate;
};

const toValidDateOrUndefined = (value: unknown): Date | undefined => {
	if (value === undefined || value === null) {
		return undefined;
	}

	const parsedDate = value instanceof Date ? value : new Date(value as string | number);
	return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
};

const normalizeOutputMessage = (outputMessage: MessageOutput): MessageOutput => {
	const startAt = toValidDate(outputMessage.time?.startAt, new Date());
	const endAt = toValidDateOrUndefined(outputMessage.time?.endAt);
	const hasTextOutput = typeof outputMessage.messageContentHTML === "string" && outputMessage.messageContentHTML.trim().length > 0;
	const hasError = typeof outputMessage.isError === "string" && outputMessage.isError.trim().length > 0;
	const isPendingPlaceholder = !hasTextOutput && !hasError && !endAt;

	return {
		...outputMessage,
		isAnswering: isPendingPlaceholder ? true : Boolean(outputMessage.isAnswering),
		time: {
			startAt,
			...(endAt ? { endAt } : {})
		}
	};
};

const toOutputMessageFromEvent = (outcomeMessage: unknown, outputMessageId: string): MessageOutput => {
	const outcome = outcomeMessage as Partial<MessageOutput> | undefined;
	const outcomeTime = outcome?.time;
	const endAt = toValidDateOrUndefined(outcomeTime?.endAt);

	return {
		...(outcome as MessageOutput),
		id: outputMessageId,
		messageType: "message-user-output",
		isAnswering: false,
		reasoning: Array.isArray(outcome?.reasoning) ? outcome.reasoning : [],
		time: {
			startAt: toValidDate(outcomeTime?.startAt, new Date()),
			...(endAt ? { endAt } : {})
		}
	};
};

if (browser) {
	queueMicrotask(() => {
		const joinedChatIds = new Set<string>();
		let previousScope = getCurrentChatScope();
		const chatServiceConnectionLocal = get(chatServiceConnection);
		if (!chatServiceConnectionLocal) {
			console.warn("Cannot establish chat connection");
			return;
		}

		const leaveJoinedChats = (scope: ChatScope) => {
			const chatIdsToLeave = [...joinedChatIds];
			joinedChatIds.clear();

			for (const chatId of chatIdsToLeave) {
				updateCurrentUserPresence(chatId, false);
				chatServiceConnectionLocal.emitLeaveChat(chatId);
			}
		};

		const syncJoinedChatRooms = () => {
			const currentScope = getCurrentChatScope();

			if (!currentScope) {
				if (previousScope && joinedChatIds.size) {
					leaveJoinedChats(previousScope);
				}

				previousScope = undefined;
				return;
			}

			if (!areChatScopesEqual(previousScope, currentScope) && previousScope && joinedChatIds.size) {
				leaveJoinedChats(previousScope);
			}

			previousScope = currentScope;

			const openChatIds = new Set(
				get(chatStripeTabsOfWorkspaceFile)
					.filter(chatTab => chatTab.fileId === currentScope.fileId && chatTab.workspaceId === currentScope.workspaceId)
					.map(chatTab => chatTab.id)
			);

			for (const joinedChatId of [...joinedChatIds]) {
				if (openChatIds.has(joinedChatId)) {
					continue;
				}

				joinedChatIds.delete(joinedChatId);
				updateCurrentUserPresence(joinedChatId, false);
				void chatServiceConnectionLocal.emitLeaveChat(joinedChatId);
			}

			for (const chatId of openChatIds) {
				if (joinedChatIds.has(chatId)) {
					continue;
				}

				joinedChatIds.add(chatId);
				updateCurrentUserPresence(chatId, true);
				void chatServiceConnectionLocal.emitJoinChat(chatId).then((status) => {
					if (status) {
						return;
					}

					joinedChatIds.delete(chatId);
					updateCurrentUserPresence(chatId, false);
				});
			}
		};

		chatStripeTabsOfWorkspaceFile.subscribe(() => {
			syncJoinedChatRooms();
		});

		let previousScopeKey = getCurrentChatScopeKey();
		const onScopeMaybeChanged = () => {
			const nextScopeKey = getCurrentChatScopeKey();
			if (nextScopeKey === previousScopeKey) {
				return;
			}

			previousScopeKey = nextScopeKey;
			syncJoinedChatRooms();
		};

		selectedFile.subscribe(() => {
			onScopeMaybeChanged();
		});

		selectedWorkspace.subscribe(() => {
			onScopeMaybeChanged();
		});

		chatServiceConnectionLocal.onNewMember((chatId, member) => {
			if (!joinedChatIds.has(chatId) || !isChatPresentInStores(chatId)) {
				return;
			}

			updateChatMemberPresence(chatId, member as unknown as ChatPresenceMember, true);
		});

		chatServiceConnectionLocal.onLeaveMember((chatId, member) => {
			if (!isChatPresentInStores(chatId)) {
				return;
			}

			updateChatMemberPresence(chatId, member as unknown as ChatPresenceMember, false);
		});

		chatServiceConnectionLocal.onNoModelsAbleToProcessAttachements((chatId, mediaType) => {
			if (!isChatPresentInStores(chatId)) {
				return;
			}

			setAlert("warning", "Attachment unsupported", `No configured model can process ${String(mediaType)} attachments.`);
		});

		chatServiceConnectionLocal.onPromptProgressMessage((chatId, messageContent) => {			
			if (!isChatPresentInStores(chatId)) {
				return;
			}

			if (!isChatActivelyProcessing(chatId)) {
				return;
			}

			if (!messageContent) {
				return;
			}

			rightSideStripeChat.appendReasoningToLastAnsweringOutput(chatId, {
				phase: "thinking",
				thoughts: [messageContent]
			} as MessageOutput["reasoning"][number]);
		});

		chatServiceConnectionLocal.onPromptProgressTool((chatId, toolEvent) => {			
			if (!isChatPresentInStores(chatId)) {
				return;
			}

			if (!isChatActivelyProcessing(chatId)) {
				return;
			}

			const normalizedToolEvent = toolEvent as {
				toolName?: string;
				params?: Record<string, unknown>;
				input?: Record<string, unknown>;
				isMCP?: boolean;
			};

			rightSideStripeChat.appendReasoningToLastAnsweringOutput(chatId, {
				phase: "tools-usage",
				tools: [{
					toolName: normalizedToolEvent.toolName ?? "tool",
					params: normalizedToolEvent.params ?? normalizedToolEvent.input ?? {},
					...(typeof normalizedToolEvent.isMCP === "boolean" ? { isMCP: normalizedToolEvent.isMCP } : {})
				}]
			} as MessageOutput["reasoning"][number]);
		});

		chatServiceConnectionLocal.onPromptPlaying((chatId, promptId, baseOutputMessage) => {
			if (!isChatPresentInStores(chatId)) {
				return;
			}

			rightSideStripeChat.upsertOutputMessage(chatId, baseOutputMessage);
			processingChatsOfWorkspaceFile.setPromptId(chatId, promptId);
		});

		chatServiceConnectionLocal.onPromptError((chatId, _promptId, outputMessageId) => {
			if (!isChatPresentInStores(chatId)) {
				return;
			}

			if (!isChatActivelyProcessing(chatId, outputMessageId)) {
				return;
			}

			rightSideStripeChat.flushQueuedReasoning(chatId);

			// Mark message as stopped
			rightSideStripeChat.markOutputMessageAsError(chatId, outputMessageId);

			// Stop processing the messages
			rightSideStripeChat.stopProcessing(chatId, false);
		});

		chatServiceConnectionLocal.onStopPlaying((chatId, _member, fileId) => {
			const currentScope = getCurrentChatScope();
			if (!currentScope || currentScope.fileId !== fileId) {
				return;
			}

			if (!isChatPresentInStores(chatId)) {
				return;
			}

			rightSideStripeChat.flushQueuedReasoning(chatId);

			rightSideStripeChat.stopProcessing(chatId);
		});

		chatServiceConnectionLocal.onPromptSuccess((chatId, outcomeMessage, outputMessageId) => {
			console.log('Prompt success', outcomeMessage);
			
			if (!isChatPresentInStores(chatId)) {
				return;
			}

			if (!isChatActivelyProcessing(chatId, outputMessageId)) {
				return;
			}

			rightSideStripeChat.flushQueuedReasoning(chatId);

			// Adds updates the message
			const chatOutcome = get(chatStripeTabsOfWorkspaceFile).find(chat => chat.id === chatId);
			if (!chatOutcome) {
				console.warn("Cannot find outcome chat to setup answer.", { chatId, outputMessageId });
				return;
			}

			const chatOutcomeMessage = chatOutcome.messages.find(message => {
				return message.messageType === "message-user-output" && message.id === outputMessageId;
			}) as MessageOutput | undefined;

			const outcomePayload = outcomeMessage as Exclude<AIAgentOutputMessage, "time"> & {
				time?: {
					startDate?: string;
					endDate?: string;
				};
			};

			const startAt = toValidDate(
				outcomePayload.time?.startDate
					?? chatOutcomeMessage?.time?.startAt
					?? new Date(),
				new Date()
			);

			const endAt = toValidDate(
				outcomePayload.time?.endDate
					?? chatOutcomeMessage?.time?.endAt
					?? new Date(),
				new Date()
			);
			
			/// ... Prepares ready message
			const readyMessage = {
				...(chatOutcomeMessage ?? {
					id: outputMessageId,
					messageType: "message-user-output",
					reasoning: [],
					model: rightSideStripeChat.createModelForMessage(chatOutcome),
					aiChatMode: chatOutcome.selectedMode
				}),
				isAnswering: false,
				messageContentHTML: outcomePayload.outputMessageContentHTML ?? chatOutcomeMessage?.messageContentHTML ?? "",
				tasksListManipulation: outcomePayload.tasksListManipulation,
				documentManipulation: outcomePayload.documentManipulation,
				time: {
					startAt,
					endAt
				}
			} satisfies MessageOutput;

			/// ... Prepares chat name
			if (outcomePayload.chatName) {
				updateChatNameInStores(chatId, outcomePayload.chatName);
			}

			/// ... Keeps the updation to db
			rightSideStripeChat.upsertOutputMessage(chatId, toOutputMessageFromEvent(readyMessage, outputMessageId));

			// Stops prompt processing
			rightSideStripeChat.stopProcessing(chatId, false);
		});

		syncJoinedChatRooms();
	});
}
