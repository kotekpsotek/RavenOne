import { AI, File } from "@ravenlens/shared";

export function getPlayModeLabel(playMode: File.FileAI.PlayMode) {
    switch (playMode) {
        case "run-non-runned":
            return "Run non-runned";
        case "run-all":
            return "Run all";
        default:
            return playMode;
    }
}

export function getAIAnswers(answers: string) {
    try {
        const answersLocal = JSON.parse(answers) as File.FileAI.AIPoint["aiAnswers"];

        if (answersLocal instanceof Array) {
            return answersLocal;
        }
        else throw("Answers cannot be typeof Array");
    }
    catch(err: any) {
        return null;
    }
}
