import { browser } from "$app/environment";
import { fetchAuthenticated } from "$lib/utils/fetch";
import { get, writable, type Readable } from "svelte/store";
import { selectedFile } from "./files";
import type { File } from "@ravenlens/shared";

export type AIChatMode = "regular-ask" | "questions-creation" | "document-manipulation"; // "visualization" | "tldr"
export type MermaidDiagramType = "flowchart" | "sequenceDiagram" | "classDiagram" | "stateDiagram-v2";
export type AIChatDecision = "accepted" | "declined";

export type SelectedTextRange = {
	id: string;
	from: number;
	to: number;
	html: string;
};

export type AIChatResponse = {
	id: string;
	answerHTML: string;
	applyTo: "chat" | "selection";
	decision?: AIChatDecision;
	publishedDate: string;
	mermaid?: {
		definition: string;
		type: MermaidDiagramType;
	};
};

export type AIChatBubble = {
	id: string;
	mode: AIChatMode;
	isActive: boolean;
	decision?: AIChatDecision;
	userPrompt: string;
	userPromptHTML: string;
	selectedTextForPrompt: SelectedTextRange[];
	aiResponse: AIChatResponse[];
	createdAt: string;
};

export type AIChatThread = {
	id: string;
	title: string;
	type: AIChatMode;
	bubbles: AIChatBubble[];
	createdAt: string;
	updatedAt: string;
};

export type FileChatStatePayload = {
	chats: AIChatThread[];
	selectedChatId?: string;
};

export type SelectedFileForChat = {
	id: string;
	name?: string;
	createdByAuthorId: string;
};

export type EditorAIChatState = {
	textFieldMode: AIChatMode;
	mermaidDiagramType?: MermaidDiagramType;
	selectedText?: {
		ranges: SelectedTextRange[];
	};
};

type ChatStoreState = {
	fileId?: string;
	workspaceId?: string;
	chats: AIChatThread[];
	selectedChatId?: string;
	isLoading: boolean;
	isSaving: boolean;
	loadError?: string;
};

type ChatDropPosition = "before" | "after";

type ChatStateResponsePayload = {
	chats?: unknown;
	selectedChatId?: unknown;
};

const CHAT_MODES: Record<AIChatMode, { modeName: string; modeDescription: string; }> = {
	"regular-ask": {
		modeName: "Ask",
		modeDescription: "Talk with AI for whatever"
	},
	"document-manipulation": {
		modeName: "Document Manipulation",
		modeDescription: "Create, update RavenOne Document/s according to your specification"
	},
	"questions-creation": {
		modeName: "Create Document Questions",
		modeDescription: "Create Questions for actually selected RavenOne Document"
	}
};

const MERMAID_TYPES: Record<MermaidDiagramType, string> = {
	flowchart: "Flowchart",
	sequenceDiagram: "Sequence",
	classDiagram: "Class",
	"stateDiagram-v2": "State"
};

const DEFAULT_CHAT_WIDTH = 420;
const MIN_CHAT_WIDTH = 300;
const MAX_CHAT_WIDTH = 760;
const DEFAULT_CHAT_HEIGHT = 360;
const MIN_CHAT_HEIGHT = 240;
const MAX_CHAT_HEIGHT_VIEWPORT_RATIO = 0.8;

const displayContextForMessagesStore = writable<string[]>([]);
const elementIsPreviewingStore = writable<{ msgBubbleId: string; aiResponseId: string } | null>(null);
const chatLayoutStore = writable({
	width: DEFAULT_CHAT_WIDTH,
	minWidth: MIN_CHAT_WIDTH,
	maxWidth: MAX_CHAT_WIDTH,
	height: DEFAULT_CHAT_HEIGHT,
	minHeight: MIN_CHAT_HEIGHT,
	maxHeightViewportRatio: MAX_CHAT_HEIGHT_VIEWPORT_RATIO,
	isOpen: true
});

const editorAIChatStore = writable<EditorAIChatState>({
	textFieldMode: "regular-ask",
	mermaidDiagramType: undefined,
	selectedText: {
		ranges: []
	}
});

function createId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}

	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeWorkspaceId(workspaceIdCandidate: unknown): string | undefined {
	if (typeof workspaceIdCandidate !== "string") {
		return undefined;
	}

	const normalizedWorkspaceId = workspaceIdCandidate.trim();
	return normalizedWorkspaceId.length ? normalizedWorkspaceId : undefined;
}

function normalizeText(valueCandidate: unknown): string {
	if (typeof valueCandidate !== "string") {
		return "";
	}

	return valueCandidate;
}

function normalizeAIChatMode(modeCandidate: AIChatMode): AIChatMode {
	if (
		modeCandidate === "regular-ask"
		|| modeCandidate === "document-manipulation"
		|| modeCandidate === "questions-creation"
	) {
		return modeCandidate;
	}

	return "regular-ask";
}

function normalizeMermaidType(typeCandidate: unknown): MermaidDiagramType {
	if (
		typeCandidate === "flowchart"
		|| typeCandidate === "sequenceDiagram"
		|| typeCandidate === "classDiagram"
		|| typeCandidate === "stateDiagram-v2"
	) {
		return typeCandidate;
	}

	return "flowchart";
}

function normalizeDecision(decisionCandidate: unknown): AIChatDecision | undefined {
	if (decisionCandidate === "accepted" || decisionCandidate === "declined") {
		return decisionCandidate;
	}

	return undefined;
}

function toIsoDateString(dateCandidate: unknown): string {
	const nextDate = new Date(typeof dateCandidate === "string" || typeof dateCandidate === "number"
		? dateCandidate
		: Date.now());

	if (Number.isNaN(nextDate.getTime())) {
		return new Date().toISOString();
	}

	return nextDate.toISOString();
}

function normalizeSelectedRange(candidate: unknown): SelectedTextRange | null {
	if (!candidate || typeof candidate !== "object") {
		return null;
	}

	const id = normalizeText((candidate as SelectedTextRange).id).trim();
	const from = Number((candidate as SelectedTextRange).from);
	const to = Number((candidate as SelectedTextRange).to);

	if (!id || !Number.isFinite(from) || !Number.isFinite(to)) {
		return null;
	}

	return {
		id,
		from,
		to,
		html: normalizeText((candidate as SelectedTextRange).html)
	};
}

function normalizeResponse(candidate: unknown): AIChatResponse | null {
	if (!candidate || typeof candidate !== "object") {
		return null;
	}

	const id = normalizeText((candidate as AIChatResponse).id).trim();
	if (!id) {
		return null;
	}

	const mermaidCandidate = (candidate as AIChatResponse).mermaid;
	const hasMermaid = Boolean(
		mermaidCandidate
		&& typeof mermaidCandidate === "object"
		&& typeof mermaidCandidate.definition === "string"
		&& mermaidCandidate.definition.trim().length
	);

	return {
		id,
		answerHTML: normalizeText((candidate as AIChatResponse).answerHTML),
		applyTo: (candidate as AIChatResponse).applyTo === "selection" ? "selection" : "chat",
		decision: normalizeDecision((candidate as AIChatResponse).decision),
		publishedDate: toIsoDateString((candidate as AIChatResponse).publishedDate),
		...(hasMermaid
			? {
				mermaid: {
					definition: normalizeText(mermaidCandidate!.definition),
					type: normalizeMermaidType(mermaidCandidate!.type)
				}
			}
			: {})
	};
}

function normalizeBubble(candidate: unknown): AIChatBubble | null {
	if (!candidate || typeof candidate !== "object") {
		return null;
	}

	const bubbleId = normalizeText((candidate as AIChatBubble).id).trim();
	if (!bubbleId) {
		return null;
	}

	const selectedTextForPrompt = Array.isArray((candidate as AIChatBubble).selectedTextForPrompt)
		? (candidate as AIChatBubble).selectedTextForPrompt
			.map(normalizeSelectedRange)
			.filter((range): range is SelectedTextRange => range !== null)
		: [];

	const aiResponse = Array.isArray((candidate as AIChatBubble).aiResponse)
		? (candidate as AIChatBubble).aiResponse
			.map(normalizeResponse)
			.filter((response): response is AIChatResponse => response !== null)
		: [];

	return {
		id: bubbleId,
		mode: normalizeAIChatMode((candidate as AIChatBubble).mode),
		isActive: Boolean((candidate as AIChatBubble).isActive),
		decision: normalizeDecision((candidate as AIChatBubble).decision),
		userPrompt: normalizeText((candidate as AIChatBubble).userPrompt),
		userPromptHTML: normalizeText((candidate as AIChatBubble).userPromptHTML),
		selectedTextForPrompt,
		aiResponse,
		createdAt: toIsoDateString((candidate as AIChatBubble).createdAt)
	};
}

function normalizeThread(candidate: unknown): AIChatThread | null {
	if (!candidate || typeof candidate !== "object") {
		return null;
	}

	const id = normalizeText((candidate as AIChatThread).id).trim();
	if (!id) {
		return null;
	}

	const bubbles = Array.isArray((candidate as AIChatThread).bubbles)
		? (candidate as AIChatThread).bubbles
			.map(normalizeBubble)
			.filter((bubble): bubble is AIChatBubble => bubble !== null)
		: [];

	return {
		id,
		title: normalizeText((candidate as AIChatThread).title).trim() || "New chat",
		type: normalizeAIChatMode((candidate as AIChatThread).type),
		bubbles,
		createdAt: toIsoDateString((candidate as AIChatThread).createdAt),
		updatedAt: toIsoDateString((candidate as AIChatThread).updatedAt)
	};
}

function normalizeThreads(candidate: unknown): AIChatThread[] {
	if (!Array.isArray(candidate)) {
		return [];
	}

	return candidate
		.map(normalizeThread)
		.filter((thread): thread is AIChatThread => thread !== null);
}

function normalizeSelectedChatId(selectedChatIdCandidate: unknown, chats: AIChatThread[]): string | undefined {
	if (typeof selectedChatIdCandidate !== "string") {
		return chats[0]?.id;
	}

	const selectedChatId = selectedChatIdCandidate.trim();
	if (!selectedChatId.length) {
		return chats[0]?.id;
	}

	const hasSelectedChat = chats.some((chat) => chat.id === selectedChatId);
	return hasSelectedChat ? selectedChatId : chats[0]?.id;
}

function getFileDescriptor(candidate: unknown): SelectedFileForChat | undefined {
	if (!candidate || typeof candidate !== "object") {
		return undefined;
	}

	const id = normalizeText((candidate as SelectedFileForChat).id).trim();
	const workspaceId = normalizeWorkspaceId((candidate as SelectedFileForChat).createdByAuthorId);
	if (!id || !workspaceId) {
		return undefined;
	}

	return {
		id,
		name: typeof (candidate as SelectedFileForChat).name === "string"
			? (candidate as SelectedFileForChat).name
			: undefined,
		createdByAuthorId: workspaceId
	};
}

function createInitialThread(title = "New chat", type: AIChatMode = "regular-ask"): AIChatThread {
	const now = new Date().toISOString();

	return {
		id: createId(),
		title,
		type,
		bubbles: [],
		createdAt: now,
		updatedAt: now
	};
}

function createEmptyState(): ChatStoreState {
	return {
		chats: [],
		selectedChatId: undefined,
		isLoading: false,
		isSaving: false,
		loadError: undefined,
		fileId: undefined,
		workspaceId: undefined
	};
}

function reorderChatsByPosition(
	chats: AIChatThread[],
	draggedChatId: string,
	targetChatId: string,
	position: ChatDropPosition
): AIChatThread[] {
	if (draggedChatId === targetChatId) {
		return chats;
	}

	const sourceIndex = chats.findIndex((chat) => chat.id === draggedChatId);
	const targetIndex = chats.findIndex((chat) => chat.id === targetChatId);

	if (sourceIndex < 0 || targetIndex < 0) {
		return chats;
	}

	const nextChats = [...chats];
	const [draggedChat] = nextChats.splice(sourceIndex, 1);
	if (!draggedChat) {
		return chats;
	}

	const adjustedTargetIndex = sourceIndex < targetIndex
		? targetIndex - 1
		: targetIndex;
	const insertionIndex = position === "before"
		? adjustedTargetIndex
		: adjustedTargetIndex + 1;

	nextChats.splice(insertionIndex, 0, draggedChat);
	return nextChats;
}

// TODO: Verify this function
async function readChatStateFromBackend(workspaceId: string, fileId: string): Promise<FileChatStatePayload> {
	const response = await fetchAuthenticated("/files/api/chat_state", {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			workspaceId,
			fileId
		})
	});

	if (!response.ok) {
		throw new Error(`Cannot load file chat state (${response.status})`);
	}

	const payload = (await response.json()) as ChatStateResponsePayload;
	const chats = normalizeThreads(payload.chats);

	return {
		chats,
		selectedChatId: normalizeSelectedChatId(payload.selectedChatId, chats)
	};
}

// TODO: Verify this function
async function writeChatStateToBackend(state: ChatStoreState): Promise<void> {
	if (!state.workspaceId || !state.fileId) {
		return;
	}

	const response = await fetchAuthenticated("/files/api/chat_state", {
		method: "PUT",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			workspaceId: state.workspaceId,
			fileId: state.fileId,
			chats: state.chats,
			selectedChatId: state.selectedChatId
		})
	});

	if (!response.ok) {
		throw new Error(`Cannot save file chat state (${response.status})`);
	}
}

export const rightSideStripeChat = (() => {
	const store = writable<ChatStoreState>(createEmptyState());
	let activeLoadRequestId = 0;
	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	const withSaveSchedule = (updater: (state: ChatStoreState) => ChatStoreState) => {
		store.update((state) => updater(state));
		scheduleSave();
	};

	const scheduleSave = () => {
		if (!browser) {
			return;
		}

		if (saveTimer) {
			clearTimeout(saveTimer);
		}

		saveTimer = setTimeout(() => {
			void persistCurrentState();
		}, 600);
	};

	const persistCurrentState = async () => {
		const state = get(store);
		if (!state.workspaceId || !state.fileId) {
			return;
		}

		store.update((currentState) => ({
			...currentState,
			isSaving: true
		}));

		try {
			await writeChatStateToBackend(state);
		} catch (error) {
			console.error("Cannot save file chat state", error);
		} finally {
			store.update((currentState) => ({
				...currentState,
				isSaving: false
			}));
		}
	};

	const loadForFile = async (fileCandidate?: SelectedFileForChat) => {
		const descriptor = getFileDescriptor(fileCandidate);
		const requestId = ++activeLoadRequestId;

		if (!descriptor) {
			store.set(createEmptyState());
			return;
		}

		store.update((state) => ({
			...state,
			fileId: descriptor.id,
			workspaceId: descriptor.createdByAuthorId,
			isLoading: true,
			loadError: undefined
		}));

		try {
			const loadedState = await readChatStateFromBackend(descriptor.createdByAuthorId!, descriptor.id);
			if (requestId !== activeLoadRequestId) {
				return;
			}

			const chats = loadedState.chats.length
				? loadedState.chats
				: [createInitialThread(`${descriptor.name ?? "File"} chat`)];

			store.set({
				fileId: descriptor.id,
				workspaceId: descriptor.createdByAuthorId,
				chats,
				selectedChatId: normalizeSelectedChatId(loadedState.selectedChatId, chats),
				isLoading: false,
				isSaving: false,
				loadError: undefined
			});

			scheduleSave();
		} catch (error) {
			if (requestId !== activeLoadRequestId) {
				return;
			}

			console.error("Cannot load file chat state", error);

			const chats = [createInitialThread(`${descriptor.name ?? "File"} chat`)];
			store.set({
				fileId: descriptor.id,
				workspaceId: descriptor.createdByAuthorId,
				chats,
				selectedChatId: chats[0].id,
				isLoading: false,
				isSaving: false,
				loadError: "Cannot load chat history"
			});
		}
	};

	const updateChatInternal = (chatId: string, updater: (chat: AIChatThread) => AIChatThread) => {
		withSaveSchedule((state) => ({
			...state,
			chats: state.chats.map((chat) => {
				if (chat.id !== chatId) {
					return chat;
				}

				const updatedChat = updater(chat);
				return {
					...updatedChat,
					updatedAt: new Date().toISOString()
				};
			})
		}));
	};

	return {
		...store,
		loadForFile,
		async flushSave() {
			await persistCurrentState();
		},
		setSelectedChatId(selectedChatId?: string) {
			withSaveSchedule((state) => ({
				...state,
				selectedChatId: normalizeSelectedChatId(selectedChatId, state.chats)
			}));
		},
		reorderChats(draggedChatId: string, targetChatId: string, position: ChatDropPosition = "after") {
			if (!draggedChatId || !targetChatId) {
				return;
			}

			withSaveSchedule((state) => ({
				...state,
				chats: reorderChatsByPosition(state.chats, draggedChatId, targetChatId, position)
			}));
		},
		createChat(type: AIChatMode, title?: string): string {
			const nextChat = createInitialThread(title ?? `${CHAT_MODES[type]} chat`, type);

			withSaveSchedule((state) => ({
				...state,
				chats: [...state.chats, nextChat],
				selectedChatId: nextChat.id
			}));

			return nextChat.id;
		},
		updateChat(chatId: string, updater: (chat: AIChatThread) => AIChatThread) {
			updateChatInternal(chatId, updater);
		},
		appendPromptBubble(options: {
			prompt: string;
			promptHTML: string;
			mode: AIChatMode;
			selectedTextForPrompt: SelectedTextRange[];
		}): { chatId: string; bubbleId: string } | null {
			const state = get(store);
			if (!state.chats.length) {
				return null;
			}

			const chatId = state.selectedChatId ?? state.chats[0].id;
			const bubbleId = createId();

			const nextBubble: AIChatBubble = {
				id: bubbleId,
				mode: options.mode,
				isActive: true,
				decision: undefined,
				userPrompt: options.prompt,
				userPromptHTML: options.promptHTML,
				selectedTextForPrompt: options.selectedTextForPrompt,
				aiResponse: [],
				createdAt: new Date().toISOString()
			};

			updateChatInternal(chatId, (chat) => ({
				...chat,
				bubbles: [...chat.bubbles, nextBubble]
			}));

			return {
				chatId,
				bubbleId
			};
		},
		applyResponses(chatId: string, bubbleId: string, responses: AIChatResponse[]) {
			updateChatInternal(chatId, (chat) => ({
				...chat,
				bubbles: chat.bubbles.map((bubble) => {
					if (bubble.id !== bubbleId) {
						return bubble;
					}

					return {
						...bubble,
						isActive: false,
						aiResponse: responses,
						decision: bubble.decision
					};
				})
			}));
		},
		setBubbleDecision(chatId: string, bubbleId: string, decision?: AIChatDecision) {
			updateChatInternal(chatId, (chat) => ({
				...chat,
				bubbles: chat.bubbles.map((bubble) => {
					if (bubble.id !== bubbleId) {
						return bubble;
					}

					return {
						...bubble,
						decision
					};
				})
			}));
		},
		setResponseDecision(chatId: string, bubbleId: string, responseId: string, decision?: AIChatDecision) {
			updateChatInternal(chatId, (chat) => ({
				...chat,
				bubbles: chat.bubbles.map((bubble) => {
					if (bubble.id !== bubbleId) {
						return bubble;
					}

					return {
						...bubble,
						aiResponse: bubble.aiResponse.map((response) => {
							if (response.id !== responseId) {
								return response;
							}

							return {
								...response,
								decision
							};
						})
					};
				})
			}));
		}
	};
})();

if (browser) {
	// Delay subscription to avoid TDZ when files.ts imports selectedChatAnswerIds.
	queueMicrotask(() => {
		selectedFile.subscribe((file) => {
			const fileDescriptor = getFileDescriptor(file);
			void rightSideStripeChat.loadForFile(fileDescriptor);
		});
	});
}

export const displayContextForMessages = displayContextForMessagesStore;
export const elementIsPreviewing = elementIsPreviewingStore;

export const rightSideStripeChatLayout = {
	...chatLayoutStore,
	updateWidth(widthCandidate: number) {
		const currentLayout = get(chatLayoutStore);
		const nextWidth = Math.max(currentLayout.minWidth, Math.min(currentLayout.maxWidth, widthCandidate));

		chatLayoutStore.update((layout) => ({
			...layout,
			width: nextWidth
		}));
	},
	updateHeight(heightCandidate: number) {
		const currentLayout = get(chatLayoutStore);
		const maxHeightByViewport = browser
			? Math.floor(window.innerHeight * currentLayout.maxHeightViewportRatio)
			: currentLayout.height;

		const maxHeight = Math.max(currentLayout.minHeight, maxHeightByViewport);
		const nextHeight = Math.max(currentLayout.minHeight, Math.min(maxHeight, heightCandidate));

		chatLayoutStore.update((layout) => ({
			...layout,
			height: nextHeight
		}));
	},
	setOpen(open: boolean) {
		chatLayoutStore.update((layout) => ({
			...layout,
			isOpen: open
		}));
	}
};

export const editorAIChat = {
	...editorAIChatStore,
	getModes() {
		return CHAT_MODES;
	},
	getMermaidTypes() {
		return MERMAID_TYPES;
	},
	getTextFieldModeTranslation(mode: AIChatMode) {
		return CHAT_MODES[mode].modeName ?? CHAT_MODES["regular-ask"].modeName;
	},
	setTextFieldMode(mode: AIChatMode) {
		editorAIChatStore.update((state) => ({
			...state,
			textFieldMode: mode
		}));
	},
	setMermaidDiagramType(type?: MermaidDiagramType) {
		editorAIChatStore.update((state) => ({
			...state,
			mermaidDiagramType: type
		}));
	},
	setSelectedTextRanges(ranges: SelectedTextRange[]) {
		editorAIChatStore.update((state) => ({
			...state,
			selectedText: {
				ranges
			}
		}));
	},
	removeSelectedText(from: number, to: number) {
		editorAIChatStore.update((state) => {
			const ranges = state.selectedText?.ranges ?? [];

			return {
				...state,
				selectedText: {
					ranges: ranges.filter((range) => !(range.from === from && range.to === to))
				}
			};
		});
	},
	clearSelectedText() {
		editorAIChatStore.update((state) => ({
			...state,
			selectedText: {
				ranges: []
			}
		}));
	}
};

export const activeChat: Readable<AIChatThread | undefined> = {
	subscribe(run) {
		return rightSideStripeChat.subscribe((state) => {
			const selectedChat = state.chats.find((chat) => chat.id === state.selectedChatId);
			run(selectedChat ?? state.chats[0]);
		});
	}
};

export class SelectedChatAnswersContext {
	static KeyName = "selectedFileChatAnswers";
	
	static constructKey(fileId: string) {
		return `${SelectedChatAnswersContext.KeyName}:${fileId}`;
	}
	
	static loadForFile(fileId: string): string[] {
		const answersKeyValue = localStorage.getItem(
			SelectedChatAnswersContext.constructKey(fileId)
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
			SelectedChatAnswersContext.constructKey(fileId),
			JSON.stringify(updated)
		);
	}
}

/**
 * This set with answers is utilized in ai chat
 * New file selected loads the context for specific file
 */
export const selectedChatAnswerIds = (() => {
	const { ...all } = writable<string[]>();

	return {
		...all,
		selectAnswer(fileId: string, answer: File.FileAI.AIAnswer) {
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
			const foundAnswerIndex = get(all).some(answerCheckId => answerCheckId === answerId);
			if (foundAnswerIndex) {
				//
				all.update(answersLocal => {
					return answersLocal.filter(answerIdLocal => answerIdLocal !== answerId);
				});
				
				//
				return true;
			}
			
			return false;
		},
		/** Get AI Answer file id */
		retriveCurrentFileAnswer(answerId: string) {
			const selectedFileLocal = get(selectedFile);
			const foundAnswersCompundListless = selectedFileLocal?.lists.flatMap(list => list.items);
			
			return foundAnswersCompundListless?.find(answer => answer.id === answerId);
		}
	}
})();
