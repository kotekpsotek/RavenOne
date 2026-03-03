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

    static getElementIsPlayablePoint(editorLocal: Editor, pointId: string): HTMLElement | undefined {
        const normalizedPointId = pointId.trim();
        if (!normalizedPointId.length) {
            return;
        }

        const editorDom = DocumentPlayablePoints.getEditorDom(editorLocal);
        const pointElement = editorDom.getElementById(normalizedPointId);

        if (!pointElement || pointElement.nodeType !== Node.ELEMENT_NODE) {
            return;
        }

        const playableListSelector = DocumentPlayablePoints.playablePointNodeTypes
            .map(nodeType => `[data-type="${nodeType}"]`)
            .join(', ');

        const playableListRoot = pointElement.closest(playableListSelector);

        if (!playableListRoot) {
            return;
        }

        return pointElement as HTMLElement;
    }
}

export interface PlayConfig {
    document: File;
    /** 
     * It's the unique in document id of item was playing
    */
    itemId: string;
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
    
    const isPointPlaying = playableDocumentsWithPoints.isPointPlayingInDocument(
        config.document,
        config.itemId
    );

    // Execute only when point is setup as playing in store
    if (isPointPlaying) {
        await updateAiAnswers(exampleAnswer)
    }
    else console.warn(`Cannot update answer because poinrt "${config.itemId}" isn't playing!`);
}

export class PointAnswerUpdation {
    static eventName: string = "newPointAIAnswer";
    pointId: string;
    aiAnswer?: AIAnswer;
    
    /**
     * @param aiAnswer - for `listen` it's not required
    */
    constructor(pointId: string, aiAnswer?: AIAnswer) {
        this.pointId = pointId;
        this.aiAnswer = aiAnswer;
    }

    dispatch() {
        document.dispatchEvent(new CustomEvent(
            PointAnswerUpdation.eventName,
            {
                detail: {
                    pointId: this.pointId,
                    aiAnswer: this.aiAnswer
                }
            }
        ));
    }

    /** Listen for updation event -> executed only for event with same point id as was passed to class instance */
    listen(listener: (aiAnswer: AIAnswer) => any | Promise<any>) {
        document.addEventListener(PointAnswerUpdation.eventName, async ev => {
            const { pointId, aiAnswer } = (ev as CustomEvent).detail;

            if (pointId === this.pointId) {
                await listener(aiAnswer);
            }
        })
    }
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
