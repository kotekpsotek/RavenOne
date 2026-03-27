import { browser } from "$app/environment";
import { env } from "$env/dynamic/public";
import { PUBLIC_CHAT_SERVICE_URL } from "$env/static/public";
import { selectedFile } from "$lib/stores/files";
import { selectedWorkspace } from "$lib/stores/workspace";
import { JWTAuth } from "$lib/utils/auth";
import { fetchAuthenticated } from "$lib/utils/fetch";
import type { BackendChatPopulated, MessageOutput, MessageUserPrompt } from "@ravenlens/shared/chat-ai/backend/schema";
import { io, type Socket } from "socket.io-client";
import { get, writable } from "svelte/store";
import type { LangchainAgent } from "@ravenlens/ai";
import type { AIAgentOutputMessage, ChatMember } from "../../../../../../packages/shared/dist/types/chat-ai/universal";
import type { PromptProcessingProgess } from "@ravenlens/shared/chat-ai";

type CreateChatResult = { success: true; chatId: string } | { success: false; reason?: string };
type SendPromptResult = { error: true; reason: string } | { success: true; idPromptProcessing?: string | undefined; outputMessage?: MessageOutput };
type StopPromptResult = { success: true } | { success: false; reason?: string };

export async function loadChatsFromFileRequest(
    fileId: string,
    workspaceId: string
): Promise<BackendChatPopulated[]> {
    try {
        const url = `${PUBLIC_CHAT_SERVICE_URL}/download_chats`
        const result = await fetchAuthenticated(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                fileId: fileId,
                workspaceId: workspaceId
            })
        });

        if (result.ok) {
            const chats = await result.json() as BackendChatPopulated[];
            return chats;
        }
        else return [];
    }
    catch {
        return [];
    }
}

export class SocketIoChatService {
    connection: Socket | undefined;
    workspaceId: string = "";
    fileId: string = "";
    private static readonly ACK_TIMEOUT_MS = 10000;

    private refreshScopeFromStores(): void {
        this.fileId = get(selectedFile)?.id ?? "";
        this.workspaceId = get(selectedWorkspace)?.id ?? "";
    }

    private emitWithAck<TResult>(
        emit: (ack: (...ackArgs: unknown[]) => void) => void,
        mapAckToResult: (...ackArgs: unknown[]) => TResult,
        fallbackResult: TResult,
        timeoutMs: number = SocketIoChatService.ACK_TIMEOUT_MS
    ): Promise<TResult> {
        return new Promise<TResult>(resolve => {
            if (!this.connection) {
                resolve(fallbackResult);
                return;
            }

            let isResolved = false;
            const timeoutId = setTimeout(() => {
                if (isResolved) {
                    return;
                }

                isResolved = true;
                resolve(fallbackResult);
            }, timeoutMs);

            const ack = (...ackArgs: unknown[]) => {
                if (isResolved) {
                    return;
                }

                isResolved = true;
                clearTimeout(timeoutId);
                resolve(mapAckToResult(...ackArgs));
            };

            try {
                emit(ack);
            }
            catch {
                if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timeoutId);
                    resolve(fallbackResult);
                }
            }
        });
    }
    
    constructor() {
        if (!browser){
            this.connection = undefined;
            return
        }

        const connectionUrl = env.PUBLIC_CHAT_SERVICE_URL?.trim() || PUBLIC_CHAT_SERVICE_URL?.trim();
        if (!connectionUrl) {
            console.warn("PUBLIC_CHAT_SERVICE_URL is not configured; chat-service connection may fail.");
        }

        this.connection = io(connectionUrl, {
            transports: ["websocket", "polling"],
            auth: callback => {
                const token = JWTAuth.getToken();

                callback({
                    authorization: token ?? undefined,
                });
            },
        });

        // 
        this.connection.on("connect_error", error => {
            console.error("Chat service socket connection error:", error?.message ?? error);
        });
    }

    // Emitters
    emitJoinChat(chatId: string): Promise<boolean> {
        this.refreshScopeFromStores();
        return this.emitWithAck<boolean>(
            ack => this.connection?.emit(
                "joinChat",
                this.workspaceId,
                this.fileId,
                chatId,
                (status: boolean) => ack(status)
            ),
            status => Boolean(status),
            false
        );
    }

    emitLeaveChat(chatId: string): Promise<boolean> {
        this.refreshScopeFromStores();
        return this.emitWithAck<boolean>(
            ack => this.connection?.emit(
                "leaveChat",
                this.workspaceId,
                this.fileId,
                chatId,
                (status: boolean) => ack(status)
            ),
            status => Boolean(status),
            false
        );
    }

    emitAcceptProposal(chatId: string, messageOutputId: string, proposalType: keyof Pick<MessageOutput, "tasksListManipulation" | "documentManipulation">): Promise<boolean> {
        this.refreshScopeFromStores();
        return this.emitWithAck<boolean>(
            ack => this.connection?.emit(
                "accept-proposal",
                this.workspaceId,
                this.fileId,
                chatId,
                messageOutputId,
                proposalType,
                (status: boolean) => ack(status)
            ),
            status => Boolean(status),
            false
        );
    }

    emitDeclineProposal(chatId: string, messageOutputId: string, proposalType: keyof Pick<MessageOutput, "tasksListManipulation" | "documentManipulation">): Promise<boolean> {
        this.refreshScopeFromStores();
        return this.emitWithAck<boolean>(
            ack => this.connection?.emit(
                "decline-proposal",
                this.workspaceId,
                this.fileId,
                chatId,
                messageOutputId,
                proposalType,
                (status: boolean) => ack(status)
            ),
            status => Boolean(status),
            false
        );
    }

    emitCreateChat(chatName?: string): Promise<CreateChatResult> {
        this.refreshScopeFromStores();
        return this.emitWithAck<CreateChatResult>(
            ack => this.connection?.emit(
                "createChat",
                this.workspaceId,
                this.fileId,
                chatName,
                (success: boolean, chatId?: string, reason?: string) => ack(success, chatId, reason)
            ),
            (success, chatId, reason) => {
                if (success && typeof chatId === "string" && chatId.trim().length > 0) {
                    return {
                        success: true,
                        chatId
                    };
                }

                return {
                    success: false,
                    ...(typeof reason === "string" && reason.trim().length > 0 ? { reason } : {})
                };
            },
            {
                success: false,
                reason: "ack_timeout"
            }
        );
    }

    emitSendPrompt(chatId: string, message: MessageUserPrompt): Promise<SendPromptResult> {
        this.refreshScopeFromStores();
        return this.emitWithAck<SendPromptResult>(
            ack => this.connection?.emit(
                "prompt",
                this.workspaceId,
                this.fileId,
                chatId,
                message,
                (success: boolean, idPromptProcessing?: string | undefined, outputMessage?: MessageOutput, reason?: string) => ack(success, idPromptProcessing, outputMessage, reason)
            ),
            (success, idPromptProcessing, outputMessage, reason) => {
                console.log('Retrived', success, idPromptProcessing, outputMessage, reason);
                
                if (!success) {
                    return {
                        error: true,
                        reason: (typeof reason === "string" && reason.trim().length > 0) ? reason : "not_specified"
                    };
                }

                return {
                    success: true,
                    ...(typeof idPromptProcessing === "string" ? { idPromptProcessing } : {}),
                    ...(outputMessage ? { outputMessage: outputMessage as MessageOutput } : {})
                };
            },
            {
                error: true,
                reason: "ack_timeout"
            }
        );
    }

    emitStopPrompt(chatId: string, promptProcessId: string): Promise<StopPromptResult> {
        this.refreshScopeFromStores();
        return this.emitWithAck<StopPromptResult>(
            ack => this.connection?.emit(
                "stopPrompt",
                this.workspaceId,
                this.fileId,
                chatId,
                promptProcessId,
                (success: boolean, reason?: string) => ack(success, reason)
            ),
            (success, reason) => ({
                success: Boolean(success),
                ...(typeof reason === "string" ? { reason } : {})
            }),
            {
                success: false,
                reason: "ack_timeout"
            }
        );
    }

    // Listeners // TODO: Add chat ids to all listeners
    onNewMember(listener: (chatId: string, member: ChatMember) => void) {
        this.connection?.on("new-member", listener);
    }

    onLeaveMember(listener: (chatId: string, member: ChatMember) => void) {
        this.connection?.on("leave-member", listener);
    }

    onNoModelsAbleToProcessAttachements(listener: (chatId: string, mediaType: LangchainAgent.Types.MediaKeys) => void) {
        this.connection?.on("no-models-able-to-process-attachement", listener);
    }
    
    onPromptProgressMessage(listener: (chatId: string, messageContent: string) => void) {
        this.connection?.on("prompt-progress-message", listener);
    }

    onPromptProgressTool(listener: (chatId: string, toolEvent: PromptProcessingProgess.PromptProgressToolEvent) => void) {
        this.connection?.on("prompt-progress-tool", listener);
    }

    onPromptPlaying(listener: (chatId: string, promptId: string, baseOutputMessage: MessageOutput) => void) {
        this.connection?.on("prompt-playing", listener);
    }
    
    /** Handles either send to other room members than emitted and for emitted */
    onPromptError(listener: (chatId: string, promptId: string | false, outputMessageId: string) => void) {
        this.connection?.on("prompt-error", listener);
    }

    /** Handles either send to other room members than emitted and for emitted */
    onPromptSuccess(listener: (chatId: string, outcomeMessage: AIAgentOutputMessage, outputMessageId: string) => void) {
        this.connection?.on("prompt-success", listener);
    }

    onStopPlaying(listener: (chatId: string, member: ChatMember, fileId: string, promptProcessId: string) => void) {
        this.connection?.on("stop-playing", listener);
    }
}

/**
 * Rules:
 * 1. When user opens chat should join to it (User can join to multiple chats atime)
 * 2. When user leaves the chat should leave it e.g:
 *  - when user closes chat
 * 3. Implement the listeners and apply changes to the storage
 */
export const chatServiceConnection = (() => {
    const { ...all } = writable<SocketIoChatService | undefined>(undefined);

    const getConnection = () => get(all);

    if (browser) {
        // Initializes connection
        all.set(
            new SocketIoChatService()
        );

        // Setups listeners
    }

    return {
        ...all,
        emitJoinChat(chatId: string): Promise<boolean> {
            return getConnection()?.emitJoinChat(chatId) ?? Promise.resolve(false);
        },
        emitLeaveChat(chatId: string): Promise<boolean> {
            return getConnection()?.emitLeaveChat(chatId) ?? Promise.resolve(false);
        },
        emitAcceptProposal(chatId: string, messageOutputId: string, proposalType: keyof Pick<MessageOutput, "tasksListManipulation" | "documentManipulation">): Promise<boolean> {
            return getConnection()?.emitAcceptProposal(chatId, messageOutputId, proposalType) ?? Promise.resolve(false);
        },
        emitDeclineProposal(chatId: string, messageOutputId: string, proposalType: keyof Pick<MessageOutput, "tasksListManipulation" | "documentManipulation">): Promise<boolean> {
            return getConnection()?.emitDeclineProposal(chatId, messageOutputId, proposalType) ?? Promise.resolve(false);
        },
        emitCreateChat(chatName?: string): Promise<CreateChatResult> {
            return getConnection()?.emitCreateChat(chatName) ?? Promise.resolve({ success: false, reason: "chat_service_not_connected" });
        },
        emitSendPrompt(chatId: string, message: MessageUserPrompt): Promise<SendPromptResult> {
            return getConnection()?.emitSendPrompt(chatId, message) ?? Promise.resolve({ error: true, reason: "chat_service_not_connected" });
        },
        emitStopPrompt(chatId: string, promptProcessId: string): Promise<StopPromptResult> {
            return getConnection()?.emitStopPrompt(chatId, promptProcessId) ?? Promise.resolve({ success: false, reason: "chat_service_not_connected" });
        }
    }
})();
