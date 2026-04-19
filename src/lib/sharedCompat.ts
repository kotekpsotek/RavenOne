import { worspacePermissionLeaderBoardAndNames as sharedWorkspacePermissionLeaderBoardAndNames } from "../../../../../node_modules/@ravenlens/shared/dist/permissions/workspace.js";
import { Collab as SharedCollab } from "../../../../../node_modules/@ravenlens/shared/dist/collaboration/collab.js";
import { amIEditorOfFile as sharedAmIEditorOfFile, isCollaboratorEditor as sharedIsCollaboratorEditor } from "../../../../../node_modules/@ravenlens/shared/dist/collaboration/collab.js";

export type Profile = import("../../../../../node_modules/@ravenlens/shared/dist/types/userAccount.js").Profile;
export type SafeProfile = import("../../../../../node_modules/@ravenlens/shared/dist/types/userAccount.js").SafeProfile;
export type ProfilePageLoadData = import("../../../../../node_modules/@ravenlens/shared/dist/types/userAccount.js").ProfilePageLoadData;
export type SubscriptionKinds = import("../../../../../node_modules/@ravenlens/shared/dist/types/subscriptions.js").SubscriptionKinds;
export type WorkspaceMember = import("../../../../../node_modules/@ravenlens/shared/dist/types/workspace/workspace.js").WorkspaceMember;
export type WorkspaceForUser = import("../../../../../node_modules/@ravenlens/shared/dist/types/workspace/workspace.js").WorkspaceForUser;
export type WorkspaceUser = import("../../../../../node_modules/@ravenlens/shared/dist/types/workspace/workspace.js").WorkspaceUser;
export type WorkspaceInvitementKind = import("../../../../../node_modules/@ravenlens/shared/dist/types/workspace/workspace.js").InvitementKind;
export type WorkspaceMemberInvitement = import("../../../../../node_modules/@ravenlens/shared/dist/types/workspace/workspace.js").WorkspaceMemberInvitement;
export type WorkspaceUserEntryLoaded = import("../../../../../node_modules/@ravenlens/shared/dist/types/workspace/workspace.js").WorkspaceUserEntryLoaded;
export type WorkspaceUserPermissions = import("../../../../../node_modules/@ravenlens/shared/dist/permissions/workspace.js").WorkspaceUserPermissions;
export type ProviderID = import("../../../../../node_modules/@ravenlens/shared/dist/ai.js").ProviderID;
export type RavenLensAvaiableAIModel = import("../../../../../node_modules/@ravenlens/shared/dist/ai.js").RavenLensAvaiableAIModel;
export type CollabEditor = import("../../../../../node_modules/@ravenlens/shared/dist/collaboration/collab.js").CollabEditor;
export type ContextDeviceFile = import("../../../../../node_modules/@ravenlens/shared/dist/types/file/fileAI.js").ContextDeviceFile;
export type ContextDeviceFileDB = import("../../../../../node_modules/@ravenlens/shared/dist/types/file/fileAI.js").ContextDeviceFileDB;
export type ContextEditorFile = import("../../../../../node_modules/@ravenlens/shared/dist/types/file/fileAI.js").ContextEditorFile;
export type ContextNetworkURL = import("../../../../../node_modules/@ravenlens/shared/dist/types/file/fileAI.js").ContextNetworkURL;
export type BrowserToolsUnion = import("../../../../../node_modules/@ravenlens/shared/dist/types/file/fileAI.js").BrowserToolsUnion;
export type BrowserToolsSpec = import("../../../../../node_modules/@ravenlens/shared/dist/types/file/fileAI.js").BrowserToolsSpec;
export type UsedAIModel = import("../../../../../node_modules/@ravenlens/shared/dist/types/file/fileAI.js").UsedAIModel;
export type PlayMode = "run-all" | "run-non-runned";

export interface SelectedTextRange {
    id: string;
    from: number;
    to: number;
    text: string;
    html?: string;
}

export interface ContextSpecificationPayload {
    desktopFiles: (ContextDeviceFile | ContextDeviceFileDB)[];
    editorFiles: ContextEditorFile[];
    networkUrls: ContextNetworkURL[];
    selectedTextRanges?: SelectedTextRange[];
    aiAnswers?: AIAnswer[];
}

export interface AIAnswer {
    id: string;
    model: UsedAIModel;
    playMode: PlayMode;
    answerTipTapHTML?: string;
    messageContentHTML?: string;
    context?: ContextSpecificationPayload;
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

export type ListItemKind = "ordered" | "unordered" | "task";

export interface EditableListItem {
    id: string;
    text: string;
    depth: number;
    checked?: boolean;
    playMode?: PlayMode;
    context?: ContextSpecificationPayload;
    answers?: AIAnswer[];
    startedAtTimestamp?: number;
    finishedAtTimestamp?: number;
}

export interface SpawnedList {
    id: string;
    kind: ListItemKind;
    name: string;
    icon: string;
    items: EditableListItem[];
}

export interface SharedFile {
    type: "file";
    subkind?: "ravencode";
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
    subentries?: SharedFile[];
    sharedURLs?: {
        url: string;
        sharedAt: Date;
        sharedByUserId: string;
    }[];
}

type RavenOneSharedFile = SharedFile;
type RavenOneSpawnedList = SpawnedList;
type RavenOneEditableListItem = EditableListItem;
type RavenOneListItemKind = ListItemKind;
type RavenOneContextSpecificationPayload = ContextSpecificationPayload;
type RavenOneContextDeviceFile = ContextDeviceFile;
type RavenOneContextDeviceFileDB = ContextDeviceFileDB;
type RavenOneContextEditorFile = ContextEditorFile;
type RavenOneContextNetworkURL = ContextNetworkURL;
type RavenOneBrowserToolsUnion = BrowserToolsUnion;
type RavenOneBrowserToolsSpec = BrowserToolsSpec;
type RavenOneUsedAIModel = UsedAIModel;
type RavenOnePlayMode = PlayMode;
type RavenOneSelectedTextRange = SelectedTextRange;
type RavenOneAIAnswer = AIAnswer;
type RavenOneAIPoint = AIPoint;

export namespace AI {
    export type ProviderID = import("../../../../../node_modules/@ravenlens/shared/dist/ai.js").ProviderID;
    export type RavenLensAvaiableAIModel = import("../../../../../node_modules/@ravenlens/shared/dist/ai.js").RavenLensAvaiableAIModel;
    export type RavenLensAvaiableAIModelWithAPIKeyAccess = import("../../../../../node_modules/@ravenlens/shared/dist/ai.js").RavenLensAvaiableAIModelWithAPIKeyAccess;
}

export namespace Workspace {
    export namespace Workspace {
        export type WorkspaceMember = import("../../../../../node_modules/@ravenlens/shared/dist/types/workspace/workspace.js").WorkspaceMember;
        export type WorkspaceForUser = import("../../../../../node_modules/@ravenlens/shared/dist/types/workspace/workspace.js").WorkspaceForUser;
        export type WorkspaceUser = import("../../../../../node_modules/@ravenlens/shared/dist/types/workspace/workspace.js").WorkspaceUser;
        export type InvitementKind = import("../../../../../node_modules/@ravenlens/shared/dist/types/workspace/workspace.js").InvitementKind;
        export type WorkspaceMemberInvitement = import("../../../../../node_modules/@ravenlens/shared/dist/types/workspace/workspace.js").WorkspaceMemberInvitement;
        export type WorkspaceUserEntryLoaded = import("../../../../../node_modules/@ravenlens/shared/dist/types/workspace/workspace.js").WorkspaceUserEntryLoaded;
    }
}

export namespace Collabortation {
    export type CollabUser = import("../../../../../node_modules/@ravenlens/shared/dist/collaboration/collab.js").CollabUser;
    export type CollabEditor = import("../../../../../node_modules/@ravenlens/shared/dist/collaboration/collab.js").CollabEditor;
    export type PossibleCollabsList = import("../../../../../node_modules/@ravenlens/shared/dist/collaboration/collab.js").PossibleCollabsList;
    export type SuccessCallback = import("../../../../../node_modules/@ravenlens/shared/dist/collaboration/collab.js").SuccessCallback;
    export type CollabsCallback = import("../../../../../node_modules/@ravenlens/shared/dist/collaboration/collab.js").CollabsCallback;
    export const Collab = SharedCollab;
    export const amIEditorOfFile = sharedAmIEditorOfFile;
    export const isCollaboratorEditor = sharedIsCollaboratorEditor;
}

export namespace Permissions {
    export namespace Workspace {
        export type WorkspaceUserPermissions = import("../../../../../node_modules/@ravenlens/shared/dist/permissions/workspace.js").WorkspaceUserPermissions;
        export const worspacePermissionLeaderBoardAndNames = sharedWorkspacePermissionLeaderBoardAndNames;
    }
}

export namespace File {
    export namespace File {
        export type File = RavenOneSharedFile;
        export type SpawnedList = RavenOneSpawnedList;
        export type EditableListItem = RavenOneEditableListItem;
        export type ListItemKind = RavenOneListItemKind;
    }

    export namespace FileAI {
        export type ContextSpecificationPayload = RavenOneContextSpecificationPayload;
        export type ContextDeviceFile = RavenOneContextDeviceFile;
        export type ContextDeviceFileDB = RavenOneContextDeviceFileDB;
        export type ContextEditorFile = RavenOneContextEditorFile;
        export type ContextNetworkURL = RavenOneContextNetworkURL;
        export type BrowserToolsUnion = RavenOneBrowserToolsUnion;
        export type BrowserToolsSpec = RavenOneBrowserToolsSpec;
        export type UsedAIModel = RavenOneUsedAIModel;
        export type PlayMode = RavenOnePlayMode;
        export type SelectedTextRange = RavenOneSelectedTextRange;
        export type AIAnswer = RavenOneAIAnswer;
        export type AIPoint = RavenOneAIPoint;
        export type PromptContextPayload = RavenOneContextSpecificationPayload;
    }
}
