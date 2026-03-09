import { page } from "$app/stores";
import { derived } from "svelte/store";

export const isSharedRoute = derived([page], ([$page]) => {
    return $page.url.pathname.startsWith('/share/');
});
export const isSharingModeOn = isSharedRoute;
