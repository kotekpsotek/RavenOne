import { UI } from "@ravenlens/frontend";
import { writable } from "svelte/store";

export const defaultAvaiableOptions = writable([
    ...UI.Workspace.Settings.constructDefaultOptions({
        "Workspace Members": {
            url: "/workspace-settings/members"
        },
        "Workspace Settings": {
            url: "/workspace-settings/common"
        }
    }), 
    {
        name: "AI Models",
        description: "Configure and Extend avaiable AI Models",
        iconProps: {
            icon: "material-symbols:wand-stars-outline-rounded"
        },
        url: "/workspace-settings/ai-models"
    }
]);
