import type { Editor } from "@tiptap/core";
import { getAIAnswers, type AIAnswer } from "$lib/editorComponents/types/AIList";

const editorAppendQueue = new WeakMap<Editor, Promise<void>>();

function getCurrentAnswers(aiAnswersAttr: unknown) {
    if (Array.isArray(aiAnswersAttr)) {
        return aiAnswersAttr;
    }

    if (typeof aiAnswersAttr === "string") {
        return getAIAnswers(aiAnswersAttr) ?? [];
    }

    return [];
}

/** Add point new answer to html attribute of the point was playing */
function appendPointAIAnswerOnce(editor: Editor, pointId: string, aiAnswer: AIAnswer) {
    const { state, view } = editor;
    let foundPointPosition: number | undefined;
    let foundPointAttrs: Record<string, unknown> | undefined;

    state.doc.descendants((docNode, pos) => {
        const nodeId = (docNode.attrs?.id as string | undefined) ?? "";
        if (nodeId !== pointId) {
            return true;
        }

        foundPointPosition = pos;
        foundPointAttrs = (docNode.attrs ?? {}) as Record<string, unknown>;

        return false;
    });

    if (foundPointPosition === undefined || foundPointAttrs === undefined) {
        console.error(`Cannot append aiAnswer: playable point with id \"${pointId}\" was not found in editor content.`);
        return false;
    }

    const pointAnswers = getCurrentAnswers(foundPointAttrs.aiAnswers);
    const nextPointAnswers = [...pointAnswers, aiAnswer];
    const nextAttrs = {
        ...foundPointAttrs,
        aiAnswers: JSON.stringify(nextPointAnswers)
    };

    const transaction = state.tr.setNodeMarkup(foundPointPosition, undefined, nextAttrs);
    view.dispatch(transaction);

    return true;
}

/**
  * Updates the point `aiAnswer` by attaching new `aiAnswer` to the end of its list of **html node**. Do what is specified here:
  * 1. Get the document is open content
  * 2. Parse the document content with use: `new DOMParser().parseFromString(documentContent, "text/html");`
  * 3. Find the point was playing by seeking with its id
  *  - if found proceed to below points
  *  - if not found return console.error message describe this
  * 4. Add the aiAnswers to the end of list with answers by parsing 'aianswers' or "aiAnswers" attr with extsing in codebase function `getAIAnswers`
  * 5. Update the editor content by replacing the actual content to answer content where is point with updated answer. Additionally is important to take gaze on:
  *    - Block the other same operations in `MainUpperStripe.svelte` and `AIListItemHoverActions.svelte` to ensure all answers will be applied to points without forgetting
  *    - Don't disperse user foucs - when user had focus in editor after updation his focus has to stay in same position
*/
export async function appendPointAIAnswer(editor: Editor | undefined, pointId: string, aiAnswer: AIAnswer) {
    if (!editor) {
        console.error(`Cannot append aiAnswer for point \"${pointId}\": editor instance is missing.`);
        return false;
    }

    const previousTask = editorAppendQueue.get(editor) ?? Promise.resolve();
    let updateResult = false;

    const nextTask = previousTask
        .catch(() => undefined)
        .then(() => {
            updateResult = appendPointAIAnswerOnce(editor, pointId, aiAnswer);
        });

    editorAppendQueue.set(editor, nextTask);

    try {
        await nextTask;
    } finally {
        if (editorAppendQueue.get(editor) === nextTask) {
            editorAppendQueue.delete(editor);
        }
    }

    return updateResult;
}