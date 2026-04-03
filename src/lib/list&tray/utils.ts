import type { File } from "@ravenlens/shared";

export function getTitle(getFrom: File.RoutinesSpikes.FrontendDownloadResultObject) {
    return getFrom.title.length ? getFrom.title : `${getFrom.date.toLocaleDateString()} ${getFrom.date.toLocaleTimeString()}`;
}
