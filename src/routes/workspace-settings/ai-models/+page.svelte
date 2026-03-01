<script lang="ts">
    import { UI } from "@ravenlens/frontend";
    import { defaultAvaiableOptions } from "..";

    defaultAvaiableOptions.update(avaiableOptions => {
        return avaiableOptions.map(option => {
            if (option.name === "AI Models") {
                return {
                    ...option,
                    isSelected: true
                }
            }

            return option;
        });
    })
</script>

<UI.Workspace.Settings.WorkspaceAIModelsScreen
    bgColor="bg-base-200"
/>
