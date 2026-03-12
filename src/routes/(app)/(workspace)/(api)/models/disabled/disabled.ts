import type { AI } from "@ravenlens/shared";

export interface DisabledModelsResponse {
    apiKeyAbsentModels: AI.RavenLensAvaiableAIModel[];
    subscriptionNotAvaiableModels: AI.RavenLensAvaiableAIModel[];
    allNotAvaiableModels: AI.RavenLensAvaiableAIModel[];
}
