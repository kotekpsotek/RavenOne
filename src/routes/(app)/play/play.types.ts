import { File, AI } from "@ravenlens/shared";
import type { BrowserToolsUnion } from "$lib/stores/files";

export interface PlayRequestBody {
    playFor: "play-document" | "play-point";
    playMode: File.FileAI.PlayMode;
    llm: AI.RavenLensAvaiableAIModel;
    file: File.File.File;
    fileContext: File.FileAI.ContextSpecificationPayload;
    fileMcpConfigJson: string;
    pointId?: string;
    pointContext?: File.FileAI.ContextSpecificationPayload;
    tools: BrowserToolsUnion[];
}