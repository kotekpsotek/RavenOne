import { browser } from "$app/environment";
import { env } from "$env/dynamic/public";
import { PUBLIC_CHAT_SERVICE_URL } from "$env/static/public";
import { selectedFile } from "$lib/stores/files";
import { selectedWorkspace } from "$lib/stores/workspace";
import { JWTAuth } from "$lib/utils/auth";
import { fetchAuthenticated } from "$lib/utils/fetch";
import type { BackendChatPopulated, MessageOutput, MessageUserPrompt } from "@ravenlens/shared/chat-ai/backend/schema";
import { io, type Socket } from "socket.io-client";
import { get } from "svelte/store";
import { LangchainAgent } from "@ravenlens/ai";
import type { AIAgentOutputMessage, ChatMember } from "../../../../../../packages/shared/dist/types/chat-ai/universal";
import type { PromptProcessingProgess } from "@ravenlens/shared/chat-ai";

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
    
    constructor() {
        if (!browser){
            this.connection = undefined;
            return
        }

        const connectionUrl = env.PUBLIC_CHAT_SERVICE_URL?.trim();
        if (!connectionUrl) {
            console.warn("PUBLIC_CHAT_SERVICE_URL is not configured; play-service connection may fail.");
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

        // Should be always pointing to actually selected file
        this.fileId = get(selectedFile)?.id ?? "";
        this.workspaceId = get(selectedWorkspace)?.id ?? "";
    }

    // Emitters
    emitJoinChat(chatId: string): Promise<boolean> {
        return new Promise<boolean>(res => {
            this.connection?.emit(
                "joinChat",
                this.workspaceId,
                this.fileId,
                chatId,
                (status: boolean) => {
                    res(status)      
                }
            );
        });
    }

    emitLeaveChat(chatId: string): Promise<boolean> {
        return new Promise<boolean>(res => {
            this.connection?.emit(
                "leaveChat",
                this.workspaceId,
                this.fileId,
                chatId,
                (status: boolean) => {
                    res(status)      
                }
            );
        });
    }

    emitAcceptProposal(chatId: string, messageOutputId: string, proposalType: keyof Pick<MessageOutput, "tasksListManipulation" | "documentManipulation">): Promise<boolean> {
        return new Promise<boolean>(res => {
            this.connection?.emit(
                "accept-proposal",
                this.workspaceId,
                this.fileId,
                chatId,
                messageOutputId,
                proposalType,
                (status: boolean) => {
                    res(status)      
                }
            );
        });
    }

    emitDeclineProposal(chatId: string, messageOutputId: string, proposalType: keyof Pick<MessageOutput, "tasksListManipulation" | "documentManipulation">): Promise<boolean> {
        return new Promise<boolean>(res => {
            this.connection?.emit(
                "decline-proposal",
                this.workspaceId,
                this.fileId,
                chatId,
                messageOutputId,
                proposalType,
                (status: boolean) => {
                    res(status)      
                }
            );
        });
    }

    emitSendPrompt(chatId: string, message: MessageUserPrompt): Promise<{ error: true, reason: string } | { success: true, idPromptProcessing?: string | undefined, outputMessage?: MessageOutput }> {
        return new Promise(res => {
            this.connection?.emit(
                "prompt",
                this.workspaceId,
                this.fileId,
                chatId,
                message,
                (success: boolean, idPromptProcessing?: string | undefined, outputMessage?: MessageOutput, reason?: string) => {
                    if (!success) {
                        res({
                            error: true,
                            reason: reason ?? "not_specified"
                        });
                    }
                    else {
                        res({
                            success: true,
                            idPromptProcessing,
                            outputMessage: outputMessage
                        });
                    }
                }
            );
        });
    }

    emitStopPrompt(chatId: string, promptProcessId: string): Promise<{ success: true } | { success: false, reason?: string }> {
        return new Promise(res => {
            this.connection?.emit(
                "stopPrompt",
                this.workspaceId,
                this.fileId,
                chatId,
                promptProcessId,
                (success: boolean, reason?: string) => {
                    res({
                        success,
                        reason
                    });
                }
            );
        });
    }

    // Listeners
    onNewMember(listener: (member: ChatMember) => void) {
        this.connection?.on("new-member", listener);
    }

    onLeaveMember(listener: (member: ChatMember) => void) {
        this.connection?.on("leave-member", listener);
    }

    onNoModelsAbleToProcessAttachements(listener: (mediaType: LangchainAgent.Types.MediaKeys) => void) {
        this.connection?.on("no-models-able-to-process-attachement", listener);
    }
    
    onPromptProgressMessage(listener: (messageContent: string) => void) {
        this.connection?.on("prompt-progress-message", listener);
    }

    onPromptProgressTool(listener: (toolEvent: PromptProcessingProgess.PromptProgressToolEvent) => void) {
        this.connection?.on("prompt-progress-tool", listener);
    }

    onPromptPlaying(listener: (promptId: string) => void) {
        this.connection?.on("prompt-playing", listener);
    }
    
    onPromptError(listener: (promptId: string | false, outputMessageId: string) => void) {
        this.connection?.on("prompt-error", listener);
    }

    onStopPlaying(listener: (member: ChatMember, fileId: string, chatId: string, promptProcessId: string) => void) {
        this.connection?.on("stop-playing", listener);
    }
    
    onPromptSuccess(listener: (outcomeMessage: AIAgentOutputMessage, outputMessageId: string) => void) {
        this.connection?.on("prompt-success", listener);
    }
}
