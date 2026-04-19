declare module "@ravenlens/shared" {
export const AI: typeof import("../../../../../../node_modules/@ravenlens/shared/dist/ai.js");
export const Permissions: typeof import("../../../../../../node_modules/@ravenlens/shared/dist/permissions/index.js");
export const Collabortation: typeof import("../../../../../../node_modules/@ravenlens/shared/dist/collaboration/collab.js");
export const Fetch: typeof import("../../../../../../node_modules/@ravenlens/shared/dist/fetch/index.js");
export const Utils: typeof import("../../../../../../node_modules/@ravenlens/shared/dist/utils/index.js");
export const Playing: typeof import("../../../../../../node_modules/@ravenlens/shared/dist/playing/index.js");
export const Limits: typeof import("../../../../../../node_modules/@ravenlens/shared/dist/limits/index.js");
export const plans: typeof import("../../../../../../node_modules/@ravenlens/shared/dist/types/subscriptions.js").plans;

export type AccountType = import("../../../../../../node_modules/@ravenlens/shared/dist/types/userAccount.js").AccountType;
export type Profile = import("../../../../../../node_modules/@ravenlens/shared/dist/types/userAccount.js").Profile;
export type SafeProfile = import("../../../../../../node_modules/@ravenlens/shared/dist/types/userAccount.js").SafeProfile;
export type ProfilePageLoadData = import("../../../../../../node_modules/@ravenlens/shared/dist/types/userAccount.js").ProfilePageLoadData;
export type SubscriptionKinds = import("../../../../../../node_modules/@ravenlens/shared/dist/types/subscriptions.js").SubscriptionKinds;
export type SubscriptionPlan = import("../../../../../../node_modules/@ravenlens/shared/dist/types/subscriptions.js").SubscriptionPlan;
export type ProviderID = AI.ProviderID;
export type RavenLensAvaiableAIModel = AI.RavenLensAvaiableAIModel;
export type RavenLensAvaiableAIModelWithAPIKeyAccess = AI.RavenLensAvaiableAIModelWithAPIKeyAccess;
export type WorkspaceMember = Workspace.Workspace.WorkspaceMember;
export type WorkspaceForUser = Workspace.Workspace.WorkspaceForUser;
export type WorkspaceUser = Workspace.Workspace.WorkspaceUser;
export type WorkspaceInvitementKind = Workspace.Workspace.InvitementKind;
export type WorkspaceMemberInvitement = Workspace.Workspace.WorkspaceMemberInvitement;
export type WorkspaceUserEntryLoaded = Workspace.Workspace.WorkspaceUserEntryLoaded;
export type SharedFile = File.File.File;
export type SpawnedList = File.File.SpawnedList;
export type EditableListItem = File.File.EditableListItem;
export type ContextSpecificationPayload = File.FileAI.ContextSpecificationPayload;
export type ContextDeviceFile = File.FileAI.ContextDeviceFile;
export type ContextDeviceFileDB = File.FileAI.ContextDeviceFileDB;
export type ContextEditorFile = File.FileAI.ContextEditorFile;
export type ContextNetworkURL = File.FileAI.ContextNetworkURL;
export type BrowserToolsUnion = File.FileAI.BrowserToolsUnion;
export type BrowserToolsSpec = File.FileAI.BrowserToolsSpec;
export type PlayMode = File.FileAI.PlayMode;
export type AIAnswer = File.FileAI.AIAnswer;

export namespace AI {
	export type ProviderID = import("../../../../../../node_modules/@ravenlens/shared/dist/ai.js").ProviderID;
	export type InputOutput = import("../../../../../../node_modules/@ravenlens/shared/dist/ai.js").InputOutput;
	export type RavenLensAvaiableAIModel = import("../../../../../../node_modules/@ravenlens/shared/dist/ai.js").RavenLensAvaiableAIModel;
	export type RavenLensAvaiableAIModelWithAPIKeyAccess = import("../../../../../../node_modules/@ravenlens/shared/dist/ai.js").RavenLensAvaiableAIModelWithAPIKeyAccess;
	export type LLMError = import("../../../../../../node_modules/@ravenlens/shared/dist/ai.js").LLMError;
	export type CustomModelData = import("../../../../../../node_modules/@ravenlens/shared/dist/ai.js").CustomModelData;
	export const avaiableAIModels: typeof import("../../../../../../node_modules/@ravenlens/shared/dist/ai.js").avaiableAIModels;
	export const avaiableProviders: typeof import("../../../../../../node_modules/@ravenlens/shared/dist/ai.js").avaiableProviders;
	export const getProviderIcon: typeof import("../../../../../../node_modules/@ravenlens/shared/dist/ai.js").getProviderIcon;
	export const getSelectedPromptObj: typeof import("../../../../../../node_modules/@ravenlens/shared/dist/ai.js").getSelectedPromptObj;
}

export namespace Permissions {
	export namespace Workspace {
		export type WorkspaceUserPermissions = import("../../../../../../node_modules/@ravenlens/shared/dist/permissions/workspace.js").WorkspaceUserPermissions;
		export const worspacePermissionLeaderBoardAndNames: typeof import("../../../../../../node_modules/@ravenlens/shared/dist/permissions/workspace.js").worspacePermissionLeaderBoardAndNames;
	}
}

export namespace Collabortation {
	export type CollabUser = import("../../../../../../node_modules/@ravenlens/shared/dist/collaboration/collab.js").CollabUser;
	export type CollabEditor = import("../../../../../../node_modules/@ravenlens/shared/dist/collaboration/collab.js").CollabEditor;
	export type SuccessCallback = import("../../../../../../node_modules/@ravenlens/shared/dist/collaboration/collab.js").SuccessCallback;
	export type CollabsCallback = import("../../../../../../node_modules/@ravenlens/shared/dist/collaboration/collab.js").CollabsCallback;
	export const Collab: typeof import("../../../../../../node_modules/@ravenlens/shared/dist/collaboration/collab.js").Collab;
	export const isCollaboratorEditor: typeof import("../../../../../../node_modules/@ravenlens/shared/dist/collaboration/collab.js").isCollaboratorEditor;
	export const amIEditorOfFile: typeof import("../../../../../../node_modules/@ravenlens/shared/dist/collaboration/collab.js").amIEditorOfFile;
}

export const Workspace: typeof import("../../../../../../node_modules/@ravenlens/shared/dist/types/workspace/index.js");
export namespace Workspace {
	export import WorkspaceSettings = import("../../../../../../node_modules/@ravenlens/shared/dist/types/workspace/index.js").WorkspaceSettings;
	export namespace Workspace {
		export type WorkspaceMember = import("../../../../../../node_modules/@ravenlens/shared/dist/types/workspace/workspace.js").WorkspaceMember;
		export type Workspace = import("../../../../../../node_modules/@ravenlens/shared/dist/types/workspace/workspace.js").Workspace;
		export type WorkspaceForUser = import("../../../../../../node_modules/@ravenlens/shared/dist/types/workspace/workspace.js").WorkspaceForUser;
		export type WorkspaceUser = import("../../../../../../node_modules/@ravenlens/shared/dist/types/workspace/workspace.js").WorkspaceUser;
		export type InvitementKind = import("../../../../../../node_modules/@ravenlens/shared/dist/types/workspace/workspace.js").InvitementKind;
		export type WorkspaceMemberInvitement = import("../../../../../../node_modules/@ravenlens/shared/dist/types/workspace/workspace.js").WorkspaceMemberInvitement;
		export type LoadWorkspaceLayout = import("../../../../../../node_modules/@ravenlens/shared/dist/types/workspace/workspace.js").LoadWorkspaceLayout;
		export type WorkspaceUserEntryLoaded = import("../../../../../../node_modules/@ravenlens/shared/dist/types/workspace/workspace.js").WorkspaceUserEntryLoaded;
	}
}

export const Play: unknown;
export namespace Play {
	export interface PlayPointAnswer {
		id: string;
		model: File.FileAI.UsedAIModel;
		playMode: File.FileAI.PlayMode;
		messageContentHTML?: string;
		context?: File.FileAI.PromptContextPayload;
		time?: {
			startAt: Date | string | number;
			endAt?: Date | string | number;
		};
		pointId?: string;
		fileId?: string;
		isAnswering?: boolean;
		isStopped?: boolean;
		isError?: unknown;
		reasoning?: unknown[];
		documentManipulation?: unknown;
		tasksListManipulation?: unknown;
		[key: string]: unknown;
	}

	export interface PlayFile {
		[key: string]: unknown;
	}

	export interface PlayPoint {
		[key: string]: unknown;
	}

	export interface PlayingPointBackendService {
		pointId?: string;
		[key: string]: unknown;
	}
}

export const File: typeof import("../../../../../../node_modules/@ravenlens/shared/dist/types/file/index.js");
export namespace File {
	export namespace FileAI {
		export type ContextSpecificationPayload = import("../../../../../../node_modules/@ravenlens/shared/dist/types/file/fileAI.js").ContextSpecificationPayload;
		export type ContextDeviceFile = import("../../../../../../node_modules/@ravenlens/shared/dist/types/file/fileAI.js").ContextDeviceFile;
		export type ContextDeviceFileDB = import("../../../../../../node_modules/@ravenlens/shared/dist/types/file/fileAI.js").ContextDeviceFileDB;
		export type ContextEditorFile = import("../../../../../../node_modules/@ravenlens/shared/dist/types/file/fileAI.js").ContextEditorFile;
		export type ContextNetworkURL = import("../../../../../../node_modules/@ravenlens/shared/dist/types/file/fileAI.js").ContextNetworkURL;
		export type BrowserToolsUnion = import("../../../../../../node_modules/@ravenlens/shared/dist/types/file/fileAI.js").BrowserToolsUnion;
		export type BrowserToolsSpec = import("../../../../../../node_modules/@ravenlens/shared/dist/types/file/fileAI.js").BrowserToolsSpec;
		export type UsedAIModel = import("../../../../../../node_modules/@ravenlens/shared/dist/types/file/fileAI.js").UsedAIModel;

		export interface SelectedTextRange {
			id: string;
			from: number;
			to: number;
			text: string;
		}

		export type PlayMode = "run-all" | "run-non-runned";

		export interface PromptContextPayload extends ContextSpecificationPayload {
			selectedTextRanges?: SelectedTextRange[];
			aiAnswers?: AIAnswer[];
		}

		export interface AIAnswer {
			id: string;
			model: UsedAIModel;
			playMode: PlayMode;
			answerTipTapHTML?: string;
			messageContentHTML?: string;
			context?: PromptContextPayload;
			tools?: unknown;
			mcp?: unknown;
			time?: {
				startAt: Date | string | number;
				endAt?: Date | string | number;
			};
			endDateTimestamp?: number;
			startDateTimestamp?: number;
			pointId?: string;
			fileId?: string;
			aiChatMode?: string;
			isAnswering?: boolean;
			isStopped?: boolean;
			isError?: unknown;
			reasoning?: unknown[];
			documentManipulation?: unknown;
			tasksListManipulation?: unknown;
			[key: string]: unknown;
		}

		export interface AIPoint {
			aiAnswers?: AIAnswer[];
		}
	}

	export namespace File {
		export type ListItemKind = import("../../../../../../node_modules/@ravenlens/shared/dist/types/file/file.js").ListItemKind;

		export interface EditableListItem extends import("../../../../../../node_modules/@ravenlens/shared/dist/types/file/file.js").EditableListItemItself {
			checked?: boolean;
			playMode?: FileAI.PlayMode;
			context?: FileAI.PromptContextPayload;
			answers?: FileAI.AIPoint["aiAnswers"];
		}

		export interface SpawnedList {
			id: string;
			kind: ListItemKind;
			name: string;
			icon: string;
			items: EditableListItem[];
		}

		export interface File extends Omit<import("../../../../../../node_modules/@ravenlens/shared/dist/types/file/file.js").File, "lists" | "routines" | "spikes"> {
			type: "file";
			id: string;
			name: string;
			createdAt: Date;
			lists: SpawnedList[];
			routines: SpawnedList[];
			spikes: SpawnedList[];
			content: string;
			createdByAuthorId: string;
			icon?: string;
			walper?: string;
			subentries?: File[];
			sharedURLs?: {
				url: string;
				sharedAt: Date;
				sharedByUserId: string;
			}[];
		}
	}

	export namespace RoutinesSpikes {
		export type ExecutionResult = import("../../../../../../node_modules/@ravenlens/shared/dist/types/routines&Spikes.js").ExecutionResult;
	}
}
}