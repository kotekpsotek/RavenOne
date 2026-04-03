import type { File } from "@ravenlens/shared";

export function getTitle(getFrom: File.RoutinesSpikes.FrontendDownloadResultObject) {
    const dateTimeAnnotation = `(${getFrom.date.toLocaleDateString()} ${getFrom.date.toLocaleTimeString(undefined, { hour: "numeric", minute: "numeric" })})`
    
    return getFrom.title.length ? `${getFrom.title} ${dateTimeAnnotation}` : dateTimeAnnotation;
}
