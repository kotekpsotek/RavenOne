import type { AI, SubscriptionKinds } from "$lib/sharedCompat";

export type DefaultModel = AI.RavenLensAvaiableAIModel;

export const starterModels: AI.RavenLensAvaiableAIModel[] = [
    {
        model: "gpt-5-mini",
        provider: "OpenAI",
        isThinking: true,
        text: { input: true, output: true },
        image: { input: true, output: true },
        sound: { input: true, output: true },
        video: { input: true, output: false }
    },
    {
        model: "gpt-5-nano",
        provider: "OpenAI",
        isThinking: true,
        text: { input: true, output: true },
        image: { input: true, output: false },
        sound: { input: true, output: false },
        video: { input: false, output: false }
    },
    {
        model: "gpt-5",
        provider: "OpenAI",
        isThinking: true,
        text: { input: true, output: true },
        image: { input: true, output: true },
        sound: { input: true, output: true },
        video: { input: true, output: true }
    },
    {
        model: "gpt-5.2",
        provider: "OpenAI",
        isThinking: true,
        text: { input: true, output: true },
        image: { input: true, output: true },
        sound: { input: true, output: true },
        video: { input: true, output: true }
    },
    {
        model: "gpt-5.4",
        provider: "OpenAI",
        isThinking: true,
        text: { input: true, output: true },
        image: { input: true, output: true },
        sound: { input: true, output: true },
        video: { input: true, output: true }
    },
    {
        model: "gpt-4-mini",
        provider: "OpenAI",
        isThinking: false,
        text: { input: true, output: true },
        image: { input: true, output: false },
        sound: { input: true, output: false },
        video: { input: false, output: false }
    },
    {
        model: "gemini-3-flash-preview",
        provider: "Google",
        isThinking: true,
        text: { input: true, output: true },
        image: { input: true, output: true },
        sound: { input: true, output: true },
        video: { input: true, output: true }
    },
    {
        model: "gemini-3.1-flash-lite-preview",
        provider: "Google",
        isThinking: true,
        text: { input: true, output: true },
        image: { input: true, output: true },
        sound: { input: true, output: true },
        video: { input: true, output: true }
    },
    {
        model: "claude-haiku-4-5",
        provider: "Anthropic",
        isThinking: true,
        text: { input: true, output: true },
        image: { input: true, output: false },
        sound: { input: false, output: false },
        video: { input: false, output: false }
    },
];
export const growthModels: AI.RavenLensAvaiableAIModel[] = [
    {
        model: "gemini-3-pro-preview",
        provider: "Google",
        isThinking: true,
        text: { input: true, output: true },
        image: { input: true, output: true },
        sound: { input: true, output: true },
        video: { input: true, output: true }
    },
    {
        model: "gemini-2.5-flash",
        provider: "Google",
        isThinking: true,
        text: { input: true, output: true },
        image: { input: true, output: true },
        sound: { input: true, output: true },
        video: { input: true, output: true }
    },
    {
        model: "gemini-2.5-pro",
        provider: "Google",
        isThinking: true,
        text: { input: true, output: true },
        image: { input: true, output: true },
        sound: { input: true, output: true },
        video: { input: true, output: true }
    },
    {
        model: "gemini-2.0-flash-lite",
        provider: "Google",
        isThinking: true,
        text: { input: true, output: true },
        image: { input: true, output: false },
        sound: { input: true, output: false },
        video: { input: true, output: false }
    },
    {
        model: "gemini-3.1-pro-preview",
        provider: "Google",
        isThinking: true,
        text: { input: true, output: true },
        image: { input: true, output: true },
        sound: { input: true, output: true },
        video: { input: true, output: true }
    },

    {
        model: "gemini-2.5-flash-lite-latest",
        provider: "Google",
        isThinking: true,
        text: { input: true, output: true },
        image: { input: true, output: false },
        sound: { input: true, output: false },
        video: { input: true, output: false }
    },
    {
        model: "claude-sonnet-4-6",
        provider: "Anthropic",
        isThinking: true,
        text: { input: true, output: true },
        image: { input: true, output: true },
        sound: { input: false, output: false },
        video: { input: false, output: false }
    },
    {
        model: "claude-sonnet-4-5",
        provider: "Anthropic",
        isThinking: true,
        text: { input: true, output: true },
        image: { input: true, output: false },
        sound: { input: false, output: false },
        video: { input: false, output: false }
    },
    ...starterModels
];
export const enterpriseModels: AI.RavenLensAvaiableAIModel[] = [
    {
        model: "gpt-5.4-pro",
        provider: "OpenAI",
        isThinking: true,
        text: { input: true, output: true },
        image: { input: true, output: true },
        sound: { input: true, output: true },
        video: { input: true, output: true }
    },
    {
        model: "gpt-5.3-codex",
        provider: "OpenAI",
        isThinking: true,
        text: { input: true, output: true },
        image: { input: false, output: false },
        sound: { input: false, output: false },
        video: { input: false, output: false }
    },
    {
        model: "claude-opus-4-5",
        provider: "Anthropic",
        isThinking: true,
        text: { input: true, output: true },
        image: { input: true, output: false },
        sound: { input: false, output: false },
        video: { input: false, output: false }
    },
    {
        model: "claude-opus-4-6",
        provider: "Anthropic",
        isThinking: true,
        text: { input: true, output: true },
        image: { input: true, output: true },
        sound: { input: true, output: false },
        video: { input: false, output: false }
    },
    ...growthModels,
    ...starterModels
];

export const subscriptionAvaiableAIModels: Record<SubscriptionKinds, AI.RavenLensAvaiableAIModel[]> = {
    starter: starterModels,
    growth: growthModels,
    enterprise: enterpriseModels
}

export const avaiableModels: AI.RavenLensAvaiableAIModel[] = Array.from(
    new Map(
        // We use enterprise models because the set with these standalone models is the welthiest
        enterpriseModels.map((m) => [m.model, m])
    ).values()
)

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
