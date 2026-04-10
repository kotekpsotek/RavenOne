import { isCurrentUserSelectedFileEditor } from "$lib/stores/collaboration";
import { isSharingModeOn } from "$lib/stores/share";
import { selectedWorkspace } from "$lib/stores/workspace";
import { derived } from "svelte/store";

export let isEditable = derived([isSharingModeOn, isCurrentUserSelectedFileEditor, selectedWorkspace], ([$isSharingModeOn, $isCurrentUserSelectedFileEditor, $selectedWorkspace]) => {
    return (!$isSharingModeOn && $isCurrentUserSelectedFileEditor && ($selectedWorkspace?.userPermissions.includes("manage_files") || $selectedWorkspace?.isOwner)) ?? false;
});
