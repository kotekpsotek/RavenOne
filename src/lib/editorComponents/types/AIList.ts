import type { ProviderID } from "@ravenlens/shared";

/* Has the types defined for AI List */
export type PlayMode = "run-non-runned" | "run-all";

export interface ContextSpecificationPayload {
    desktopFiles: ContextDeviceFile[];
    editorFiles: ContextEditorFile[];
    networkUrls: ContextNetworkURL[];
};

export interface ContextDeviceFile {
    id: string;
    name: string;
    type: string;
    size: number;
    locationHint: string;
    previewDataUrl?: string;
}

export interface ContextEditorFile {
    id: string;
    name: string;
}

export interface ContextNetworkURL {
    id: string;
    url: string;
    favicon: string;
}

/** Tools Type */
export interface BrowserToolsSpec {
    /** Permits to proceed with webresearch */
    webSearch: boolean;
}

interface AIAnswer {
    playMode: PlayMode;
    dateTimestamp: number;
    model: {
        /** Is the id of model from configured user models -> It can be the custom model */
        id: string;
        /** It's the model name of specified user models */
        name: string;
        /** It's the provider name or different custom provider name */
        provider: ProviderID | { provider: string };
        /** Is the wieght of specified  */
        weight: number;
        
    };
    /** e.g: Desktop file, Editor Files, Networks urls -> all have to have remembered content */
    context: any[];
    /** Is the mcp files specification. If not specified or false means mcp was disabled */
    mcp?: false | string;
    /** Is the initial tools specification */
    tools: BrowserToolsSpec;
    /** Is the content of answer from ai - it has to be html content compilant with tiptap */
    answerTipTapHTML: string;
}

export interface AIPoint {
    /** Is the list of answers from the oldest to the newest */
    aiAnswers: AIAnswer[];
}

export function getAIAnswers(answers: string) {
    try {
        const answersLocal = JSON.parse(answers) as AIPoint["aiAnswers"];

        if (answersLocal instanceof Array) {
            return answersLocal;
        }
        else throw("Answers cannot be typeof Array");
    }
    catch(err: any) {
        return null;
    }
}
