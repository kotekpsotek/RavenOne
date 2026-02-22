interface InputOutput {
    input: boolean;
    output: boolean;
}

type DNNProviders = "Google" | "Anthropic" | "OpenAI"

export interface DefaultModel {
    name: string;
    provider: DNNProviders;
    isThinking?: boolean;
    isVisionCapable?: {
        image?: InputOutput;
        video?: InputOutput;
    };
    isAudioCapable?: InputOutput;
}

export const avaiableModels: DefaultModel[] = [
    {
        name: "gpt-5-mini",
        provider: "OpenAI",
        isThinking: true
    },
    {
        name: "gpt-5-nano",
        provider: "OpenAI",
        isThinking: true
    },
];

export function getProviderIconifyIcon(provider: DNNProviders) {
    switch(provider) {
        case "Google":
            return "simple-icons:googlegemini";
        case "Anthropic":
            return "simple-icons:claude";
        case "OpenAI":
            return "simple-icons:openai";
    }
}
