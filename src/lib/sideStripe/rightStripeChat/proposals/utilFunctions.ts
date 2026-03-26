/**
 * What it does TODO:
 *  1. Call the backend to mark the message as declined/accepted
 *  2. Find the message on `chatStripeTabsOfWorkspaceFile` and mark these chats as finished
 *  3. Close the chats preview with `fileChatEditionPreviewShowing`
 */

import { activeChat, chatStripeTabsOfWorkspaceFile, fileChatEditionPreviewShowing } from "$lib/stores/aiRightSideChat";
import { loadingState } from "$lib/stores/loadingScreen";
import { userProfile } from "$lib/stores/user";
import { setAlert } from "$lib/utils/alert";
import { get } from "svelte/store";
import type { DocumentManipulation, MessageOutput } from "@ravenlens/shared/chat-ai/backend/schema";
import { chatServiceConnection } from "../connections";

function setupDocumentManipulationStatus(chatId: string, outputMessage: MessageOutput, status: DocumentManipulation["status"]) {
    chatStripeTabsOfWorkspaceFile.update(chats => {
        return chats.map(chat => {
            if (chat.id === chatId) {
                chat.messages = chat.messages.map(message => {
                    if (message.id === outputMessage.id && message.messageType === "message-user-output") {
                        const lM = message as MessageOutput;
                        
                        if (lM.documentManipulation) {
                            lM.documentManipulation = {
                                ...lM.documentManipulation,
                                status: status,
                                decidedState: {
                                    at: new Date(),
                                    byUserId: get(userProfile)!.id
                                }
                            };
                        }

                        return lM;
                    }

                    return message;
                });
            }

            return chat;
        });
    });
}

//
export function callAcceptDocumentManipulation(outputMessage: MessageOutput) {
    return async () => {
        const activeChatState = get(activeChat);
        if (!activeChatState?.id) {
            return;
        }
        
        // Set loading state
        loadingState.setLoadingState(true);
        
        const success = await chatServiceConnection.emitAcceptProposal(activeChatState.id, outputMessage.id, "documentManipulation");
        if (!success) {
            loadingState.setLoadingState(false);
            setAlert("error", "Proposal accept failed", "Cannot accept the document proposal right now.");
            return;
        }
    
        // 2. If backend returned success
        setupDocumentManipulationStatus(activeChatState.id, outputMessage, "accepted");
    
        // 3.
        fileChatEditionPreviewShowing.unsetPreviewing();

        //
        loadingState.setLoadingState(false);
    }
}

export function callDeclineDocumentManipulation(outputMessage: MessageOutput) {
    return async () => {
        const activeChatState = get(activeChat);
        if (!activeChatState?.id) {
            return;
        }
        
        // Set loading state
        loadingState.setLoadingState(true);

        const success = await chatServiceConnection.emitDeclineProposal(activeChatState.id, outputMessage.id, "documentManipulation");
        if (!success) {
            loadingState.setLoadingState(false);
            setAlert("error", "Proposal decline failed", "Cannot decline the document proposal right now.");
            return;
        }
    
        // 2. If backend returned success
        setupDocumentManipulationStatus(activeChatState.id, outputMessage, "declined");
    
        // 3.
        fileChatEditionPreviewShowing.unsetPreviewing();

        //
        loadingState.setLoadingState(false);
    }
}

//
function setupTaskListManipulationState(chatId: string, outputMessage: MessageOutput, status: DocumentManipulation["status"]) {
    chatStripeTabsOfWorkspaceFile.update(chats => {
        return chats.map(chat => {
            if (chat.id === chatId) {
                chat.messages = chat.messages.map(message => {
                    if (message.id === outputMessage.id && message.messageType === "message-user-output") {
                        const lM = message as MessageOutput;
                        
                        if (lM.tasksListManipulation) {
                            lM.tasksListManipulation = {
                                ...lM.tasksListManipulation,
                                status: status,
                                decidedState: {
                                    at: new Date(),
                                    byUserId: get(userProfile)!.id
                                }
                            };
                        }

                        return lM;
                    }

                    return message;
                });
            }

            return chat;
        });
    });
}

//
export function callAcceptTasksManipulation(outputMessage: MessageOutput) {
    return async () => {
        const activeChatState = get(activeChat);
        if (!activeChatState?.id) {
            return;
        }

        // Set loading state
        loadingState.setLoadingState(true);

        const success = await chatServiceConnection.emitAcceptProposal(activeChatState.id, outputMessage.id, "tasksListManipulation");
        if (!success) {
            loadingState.setLoadingState(false);
            setAlert("error", "Proposal accept failed", "Cannot accept the task proposal right now.");
            return;
        }

        // 2. Update local state
        setupTaskListManipulationState(activeChatState.id, outputMessage, "accepted");

        // 3. Close preview
        fileChatEditionPreviewShowing.unsetPreviewing();

        //
        loadingState.setLoadingState(false);
    }
}

export function callDeclineTasksManipulation(outputMessage: MessageOutput) {
    return async () => {
        const activeChatState = get(activeChat);
        if (!activeChatState?.id) {
            return;
        }

        // Set loading state
        loadingState.setLoadingState(true);

        const success = await chatServiceConnection.emitDeclineProposal(activeChatState.id, outputMessage.id, "tasksListManipulation");
        if (!success) {
            loadingState.setLoadingState(false);
            setAlert("error", "Proposal decline failed", "Cannot decline the task proposal right now.");
            return;
        }

        // 2. Update local state
        setupTaskListManipulationState(activeChatState.id, outputMessage, "declined");

        // 3. Close preview
        fileChatEditionPreviewShowing.unsetPreviewing();

        //
        loadingState.setLoadingState(false);
    }
}
