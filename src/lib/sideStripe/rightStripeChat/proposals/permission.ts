import { isCurrentUserSelectedFileEditor } from "$lib/stores/collaboration";
import { userProfile } from "$lib/stores/user";
import { selectedWorkspace } from "$lib/stores/workspace";
import { derived } from "svelte/store";
import { Permissions } from "@ravenlens/shared";

/**
 * User has to be:
 * 1. Logged in
 * 2. Have the `manage_files` permission in workspace or be workspace-owner
 * 3. Be the `selected file editor`
 */
export const isUserDecisionPermitted = derived(
	[userProfile, selectedWorkspace, isCurrentUserSelectedFileEditor],
	([$userProfile, $selectedWorkspace, $isCurrentUserSelectedFileEditor]) => {
		// 1. Must be logged in
		if (!$userProfile) {
			return false;
		}

		// 2. Must be selected file editor
		if (!$isCurrentUserSelectedFileEditor) {
			return false;
		}

		// 3. Must have manage_files permission in the selected workspace OR be workspace owner
		if (!$selectedWorkspace) {
			return false;
		}

		const isOwner = $selectedWorkspace.ownerUserId === $userProfile.id;
		const userPermissions = Array.isArray(($selectedWorkspace.userPermissions))
			? $selectedWorkspace.userPermissions
			: [];

		const canManageFiles = isOwner || userPermissions.includes(Permissions.Workspace.worspacePermissionLeaderBoardAndNames.manage_files);

		return Boolean(canManageFiles);
	}
);
