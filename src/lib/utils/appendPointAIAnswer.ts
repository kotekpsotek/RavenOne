import type { Editor } from "@tiptap/core";
import { getAIAnswers, type AIAnswer } from "$lib/editorComponents/types/AIList";

const editorAppendQueue = new WeakMap<Editor, Promise<void>>();

function clampSelectionPosition(position: number, maxPosition: number) {
    if (!Number.isFinite(position)) {
        return 1;
    }

    return Math.max(1, Math.min(position, Math.max(1, maxPosition)));
}

function appendPointAIAnswerOnce(editor: Editor, pointId: string, aiAnswer: AIAnswer) {
    const documentContent = editor.getHTML() ?? "";
    const parsedDocument = new DOMParser().parseFromString(documentContent, "text/html");
    const pointElement = parsedDocument.getElementById(pointId);

    if (!pointElement) {
        console.error(`Cannot append aiAnswer: playable point with id \"${pointId}\" was not found in editor content.`);
        return false;
    }

    const pointAnswersAttr = pointElement.getAttribute("aianswers") ?? pointElement.getAttribute("aiAnswers") ?? "[]";
    const pointAnswers = getAIAnswers(pointAnswersAttr) ?? [];
    const nextPointAnswers = [...pointAnswers, aiAnswer];
    const serializedAnswers = JSON.stringify(nextPointAnswers);

    pointElement.setAttribute("aianswers", serializedAnswers);
    pointElement.setAttribute("aiAnswers", serializedAnswers);

    const wasEditorFocused = editor.isFocused;
    const previousSelection = editor.state.selection;

    editor.commands.setContent(parsedDocument.body.innerHTML);

    if (wasEditorFocused) {
        const maxPosition = editor.state.doc.content.size;
        const nextFrom = clampSelectionPosition(previousSelection.from, maxPosition);
        const nextTo = clampSelectionPosition(previousSelection.to, maxPosition);

        try {
            editor.chain().setTextSelection({ from: nextFrom, to: nextTo }).focus().run();
        } catch (error) {
            console.error("Failed to restore editor selection after aiAnswer append.", error);
        }
    }

    return true;
}

/**
  * Updates the point `aiAnswer` by attaching new `aiAnswer` to the end of its list. Do what is specified here:
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