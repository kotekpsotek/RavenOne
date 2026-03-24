/**
 * What it does TODO:
 *  1. Call the backend to mark the message as declined/accepted
 *  2. Find the message on `chatStripeTabsOfWorkspaceFile` and mark these chats as finished
 *  3. Close the chats preview with `fileChatEditionPreviewShowing`
 */

import { activeChat, chatStripeTabsOfWorkspaceFile, fileChatEditionPreviewShowing } from "$lib/stores/aiRightSideChat";
import { loadingState } from "$lib/stores/loadingScreen";
import { userProfile } from "$lib/stores/user";
import { get } from "svelte/store";
import type { DocumentManipulation, MessageOutput } from "@ravenlens/shared/chat-ai/backend/schema";

function setupDocumentManipulationStatus(chatId: string, outputMessage: MessageOutput, status: DocumentManipulation["status"]) {
    chatStripeTabsOfWorkspaceFile.update(chats => {
        return chats.map(chat => {
            if (chat.id === chatId) {
                chat.messages = chat.messages.map(message => {
                    if (message.id === outputMessage.id) {
                        const lM = message as MessageOutput;
                        
                        return {
                            ...message,
                            documentManipulation: {
                                ...outputMessage["documentManipulation"]!,
                                status: status,
                                decidedState: {
                                    at: new Date(),
                                    byUserId: get(userProfile)!.id
                                }
                            }
                        };
                    }

                    return message
                })
            }

            return chat;
        });
    });
}

//
export function callAcceptDocumentManipulation(outputMessage: MessageOutput) {
    return async () => {
        const activeChatState = get(activeChat);
        const editionPreviewState = get(fileChatEditionPreviewShowing);
        
        // Set loading state
        loadingState.setLoadingState(true);
        
        // 1. TODO:
    
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
        const editionPreviewState = get(fileChatEditionPreviewShowing);
        
        // Set loading state
        loadingState.setLoadingState(true);

        // 1. TODO: Call socket.io
    
        // 2. If backend returned success
        setupDocumentManipulationStatus(activeChatState.id, outputMessage, "declined");
    
        // 3.
        fileChatEditionPreviewShowing.unsetPreviewing();

        //
        loadingState.setLoadingState(false);
    }
}

//
export function callAcceptTasksManipulation(outputMessage: MessageOutput) {
    return async () => {
        // Set loading state
        loadingState.setLoadingState(true);

        // Logic

        //
        loadingState.setLoadingState(false);
    }
}

export function callDeclineTasksManipulation(outputMessage: MessageOutput) {
    return async () => {
        // Set loading state
        loadingState.setLoadingState(true);

        // Logic

        //
        loadingState.setLoadingState(false);
    }
}
