import { page } from "$app/stores";
import type { UI } from "@ravenlens/frontend";
import { selectedWorkspace } from "$lib/stores/workspace";
import { getAllowedWorkspaceSettingsPaths } from "$lib/workspace-settings/permissions";
import { derived } from "svelte/store";

export function optionURLToString(option: UI.Workspace.Settings.Types.AvaiableSettingOption) {
    return typeof option.url === "string" ? option.url : (option.url ? option.url.join("/") : "")
}

const optionsByPath: Record<string, UI.Workspace.Settings.Types.AvaiableSettingOption> = {
    "/workspace-settings/common": {
        name: "Workspace Settings",
        description: "Workspace management",
        iconProps: { icon: "material-symbols:supervised-user-circle" },
        url: "/workspace-settings/common"
    },
    "/workspace-settings/members": {
        name: "Workspace Members",
        description: "Workspace Members management",
        iconProps: { icon: "material-symbols:groups" },
        url: "/workspace-settings/members"
    },
    "/workspace-settings/ai-models": {
        name: "AI Models",
        description: "Configure and Extend avaiable AI Models",
        iconProps: {
            icon: "material-symbols:wand-stars-outline-rounded"
        },
        url: "/workspace-settings/ai-models"
    }
};

export const avaiableOptions = derived([selectedWorkspace], ([$selectedWorkspace]) => {
    return getAllowedWorkspaceSettingsPaths($selectedWorkspace)
        .map(path => optionsByPath[path])
        .filter((option): option is UI.Workspace.Settings.Types.AvaiableSettingOption => Boolean(option));
});

export const selectedOptionItem = derived([page, avaiableOptions], ([$page, $avaiableOptions]) => {
    return $avaiableOptions.find(option => $page.url.pathname.endsWith(optionURLToString(option)));
});
