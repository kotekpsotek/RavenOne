import type { AI } from "@ravenlens/shared";

export type DefaultModel = AI.RavenLensAvaiableAIModel;

export const avaiableModels: AI.RavenLensAvaiableAIModel[] = [
    {
        model: "gpt-5-mini",
        provider: "OpenAI",
        isThinking: true,
        image: {
            input: true,
            output: false
        }
    },
    {
        model: "gpt-5-nano",
        provider: "OpenAI",
        isThinking: true,
        image: {
            input: true,
            output: false
        }
    },
];

export function getProviderIconifyIcon(provider: AI.ProviderID) {
    switch(provider) {
        case "Google":
            return "simple-icons:googlegemini";
        case "Anthropic":
            return "simple-icons:claude";
        case "OpenAI":
            return "simple-icons:openai";
    }
}
