import type { AI } from "$lib/sharedCompat";

export interface DisabledModelsResponse {
    apiKeyAbsentModels: AI.RavenLensAvaiableAIModel[];
    subscriptionNotAvaiableModels: AI.RavenLensAvaiableAIModel[];
    allNotAvaiableModels: AI.RavenLensAvaiableAIModel[];
}
