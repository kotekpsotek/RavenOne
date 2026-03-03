import type { AI } from "@ravenlens/shared";
import type { AIAnswer, ContextSpecificationPayload, PlayMode } from "./editorComponents/types/AIList";
import type { File } from "./stores/files";
import type { Editor } from "svelte-tiptap";
import type { NodeViewProps } from "@tiptap/core";
import { playableDocumentsWithPoints } from "./stores/playMode";

interface PlayModeCompliance {
    playMode: PlayMode;
}

/**
 * Note: editorLocal -> is passed to trigger svelte reactivity and reload function when editor state changes
 */
export class DocumentPlayablePoints {
    static playablePointNodeTypes: string[] = ["aiOrderedList", "aiBulletList", "aiTaskList"];
    
    static getEditorDom(editorLocal: Editor) {
        const editorContent = editorLocal?.getHTML() ?? "";
        const editorDom = new DOMParser().parseFromString(editorContent, "text/html");

        return editorDom;
    }

    static getDocumentPlayableLists(editorLocal: Editor): Element[] {
        const editorDom = DocumentPlayablePoints.getEditorDom(editorLocal);
        const playablePoints = DocumentPlayablePoints.playablePointNodeTypes.flatMap(nodeDataTypeAttr => {
            const htmlPlayableListElements = editorDom.querySelectorAll(`*[data-type="${nodeDataTypeAttr}"]`);
            return Array.from(htmlPlayableListElements);
        });

        return playablePoints;
    }

    static hasDocumentSomePlayableList(editorLocal: Editor) {
        const playableLists = DocumentPlayablePoints.getDocumentPlayableLists(editorLocal);
        return playableLists.length > 0
    }

    static isPointPlayModeCompilant(point: HTMLLIElement, playModeCompilanceConfig: PlayModeCompliance) {
        switch(playModeCompilanceConfig.playMode) {
            case 'run-non-runned':
                const itemAnswersAttr = point.getAttribute("aianswers") ?? point.getAttribute("aiAnswers");
                if (!itemAnswersAttr) {
                    return true;
                }
                else {
                    try {
                        const parsed = JSON.parse(itemAnswersAttr);

                        if (parsed instanceof Array) { // This is supposed to be list with ai-answers
                            if (!parsed.length) { // when item is empty in this mode is passed as playable item
                                return true;
                            }
                            else return false; // when item isn't empty in this mode is ignored
                        }
                        else throw("'aianswers' attr is supposed to be array while it is: " + typeof parsed);
                    }
                    catch(err) {
                        console.error(`Error while parsing aianswers of item with id: '${point.id}'`, err);
                        return false;
                    }
                }
            break;

            case 'run-all': // all subpoinrts in this layer are accepted
                return true;

            default:
                console.warn(`Unhandled playmode: ${playModeCompilanceConfig.playMode}`);
                return false;
        }
    }
    
    static getDocumentAllPlayablePoints(
        editorLocal: Editor,
        playModeCompilanceConfig?: false | PlayModeCompliance
    ) {
        const playableLists = DocumentPlayablePoints.getDocumentPlayableLists(editorLocal);
        const extractedPointsIds = [] as string[];

        for (const playableList of playableLists) {
            const listItems = playableList.querySelectorAll('li');
            listItems.forEach(point => {
                // Add with avoiding duplicates
                if (point.id && !extractedPointsIds.includes(point.id)) {
                    if (!playModeCompilanceConfig) { // without checking mode compilance
                        extractedPointsIds.push(point.id);
                    }
                    else if (DocumentPlayablePoints.isPointPlayModeCompilant(point, playModeCompilanceConfig)) { // with checking mode compilance
                        extractedPointsIds.push(point.id);
                    }
                }
            });
        }

        return extractedPointsIds;
    }

    static getParentPointPlayableChildPoints(editorLocal: Editor, parentPointId: string, playModeConfig?: false | PlayModeCompliance) {
        const editorDom = DocumentPlayablePoints.getEditorDom(editorLocal);
        const thisListItemSubPoints = editorDom.querySelectorAll(`#${parentPointId} li`) as NodeListOf<HTMLLIElement>; // matches multiple layers of subpoints
        
        if (!playModeConfig) {
            return Array.from(thisListItemSubPoints);
        }
        else return Array.from(thisListItemSubPoints).map(point => {
            return DocumentPlayablePoints.isPointPlayModeCompilant(point, playModeConfig) ? point : undefined;
        }).filter(point => point !== undefined);
    }

    static doesPlayablePointExists(editorLocal: Editor, pointId: string, playMode?: false | PlayModeCompliance) {
        const allPlayablePoints = DocumentPlayablePoints.getDocumentAllPlayablePoints(editorLocal, playMode);
        return allPlayablePoints.includes(pointId);
    }
}

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

/**
 * 
 * @param updateAiAnswers - function is calling when server has generated answer for point
 * @param config 
 */
export async function play(updateAiAnswers: (aiAnswerOutcome: AIAnswer) => Promise<void>, config: PlayConfig) {
    const startDateTimestamp = Date.now();

    // TODO: This is simulation / send this to backend with socket.io connection
    await new Promise(res => setTimeout(res, 5_000));
    const endDateTimestamp = Date.now();

    // Save the result of playing to aiAnswers attribute FIXME: Show real
    const exampleAnswer: AIAnswer = {
        playMode: config.mode,
        startDateTimestamp,
        endDateTimestamp,
        model: {
            id: `${config.model.provider}:${config.model.model}`,
            name: config.model.model,
            provider: config.model.provider,
            weight: 1
        },
        context: [
            ...config.contextSpec.desktopFiles,
            ...config.contextSpec.editorFiles,
            ...config.contextSpec.networkUrls
        ],
        mcp: config.mcpServers[0] ?? false,
        tools: {
            webSearch: config.tools.includes("webSearch")
        },
        answerTipTapHTML: `<p>This is an example AI generated response for item ${config.itemId ?? "unknown"}.</p>`
    }
    
    await updateAiAnswers(exampleAnswer)
}

/** Exectuted once point was destroyed. It's designed to:
 *  - Mark point as removed when was destroyed
*/
export function onRemovePlayablePoint(document: File | undefined, pointId: string) {
    if (!document) {
        return false;
    }
    
    // FIXME: Add function to call backend to stop point playing
    // Childs points are removed since removal of parent remmoves the sub-elements
    playableDocumentsWithPoints.unsetPointPlaying(pointId, document, undefined, false, {
        includeChildPoints: true
    });

    return true;
}
