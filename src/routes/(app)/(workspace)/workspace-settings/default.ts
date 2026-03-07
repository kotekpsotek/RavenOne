import { page } from "$app/stores";
import type { UI } from "@ravenlens/frontend";
import { derived } from "svelte/store";

export function optionURLToString(option: UI.Workspace.Settings.Types.AvaiableSettingOption) {
    return typeof option.url === "string" ? option.url : (option.url ? option.url.join("/") : "")
}

export const avaiableOptions: UI.Workspace.Settings.Types.AvaiableSettingOption[] = [
    {
        name: "Workspace Settings",
        description: "Workspace management",
        iconProps: { icon: "material-symbols:supervised-user-circle" },
        url: "/workspace-settings/common"
    },
    {
        name: "Workspace Members",
        description: "Workspace Members management",
        iconProps: { icon: "material-symbols:groups" },
        url: "/workspace-settings/members"
    },
    {
        name: "AI Models",
        description: "Configure and Extend avaiable AI Models",
        iconProps: {
            icon: "material-symbols:wand-stars-outline-rounded"
        },
        url: "/workspace-settings/ai-models"
    }
];

export const selectedOptionItem = derived([page], ([$page]) => avaiableOptions.find(option => $page.url.pathname.endsWith(optionURLToString(option))));
