import type { AI } from "@ravenlens/shared";
import type { ContextSpecificationPayload, PlayMode } from "./editorComponents/types/AIList";
import type { File } from "./stores/files";
import type { Editor as SvelteEditor } from "svelte-tiptap";

export interface PlayConfig {
    document: File;
    /** 
     * It's the unique in document id of item was playing
     * It presence means play mode was used for specific item
     * Rest is handled by the logic of each point e.g: retriving the point answers and point subasnwers will proceed with this logic
    */
    itemId?: string;
    /** It's the play mode is selected */
    mode: PlayMode;
    model: AI.RavenLensAvaiableAIModel;
    tools: string[];
    mcpServers: string[];
    contextSpec: ContextSpecificationPayload;
}

export const playableNodes = (() => {
    const nodeDataTypeAttr: string[] = ["aiOrderedList", "aiBulletList", "aiTaskList"];
    
    return {
        nodeDataTypeAttr,
    }
})();

export function hasFileSomePlayableNode(file: File, editor: SvelteEditor | undefined) {
    if (!editor) {
        return false;
    }

    const html = editor?.getHTML();

    if (!html.trim()) {
        return false;
    }

    const domParsed = new DOMParser().parseFromString(html ?? "", "text/html");

    return playableNodes.nodeDataTypeAttr.some(nodeDataTypeAttr => {
        const htmlElements = domParsed.querySelectorAll(`*[data-type="${nodeDataTypeAttr}"]`);
        return htmlElements && htmlElements.length > 0;
    });
}

export async function play(config: PlayConfig) {
    // TODO: This is simulation / send this to backend with socket.io connection
    return new Promise(res => setTimeout(res, 5_000));
}
