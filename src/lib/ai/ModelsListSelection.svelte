<script lang="ts">
    import { browser } from "$app/environment";
    import { avaiableModels } from "$lib/config/models";
    import { downloadUnavaiableModelsRequest } from "$lib/files/connections/connections";
    import { canManageWorkspaceFiles } from "$lib/stores/subscription";
    import { selectedWorkspace } from "$lib/stores/workspace";
    import { UI } from "@ravenlens/frontend";
    import { get, writable } from "svelte/store";
    import { modelWeights, selectedModelKey } from "./model";

    // State
    const modelOrderByName = new Map(
        avaiableModels.map((model, index) => [model.model, index])
    );

    // Helpers
    function sortModelsByAvailability(disabledModels?: typeof avaiableModels) {
        const unavailableModelNames = new Set((disabledModels ?? []).map((model) => model.model));

        return [...avaiableModels].sort((leftModel, rightModel) => {
            const isLeftUnavailable = unavailableModelNames.has(leftModel.model);
            const isRightUnavailable = unavailableModelNames.has(rightModel.model);

            if (isLeftUnavailable === isRightUnavailable) {
                return (modelOrderByName.get(leftModel.model) ?? 0) - (modelOrderByName.get(rightModel.model) ?? 0);
            }

            return isLeftUnavailable ? 1 : -1;
        });
    }

    function ensureModelWeight(key: string) {
        if (!key || $modelWeights[key] !== undefined) {
            return;
        }

        $modelWeights = {
            ...$modelWeights,
            [key]: 1
        };
    }
    
    // Handlers
    function onModelChange(ev: Event) {
        const target = ev.currentTarget as HTMLSelectElement | null;
        const modelNameFromTarget = target?.value;
        const modelNameFromDetail = (ev as CustomEvent<string | undefined>).detail;
        const nextModelKey = modelNameFromTarget ?? modelNameFromDetail ?? get(selectedModelKey);
        
        selectedModelKey.set(nextModelKey);
        ensureModelWeight(nextModelKey);
    }
</script>

{#await downloadUnavaiableModelsRequest({ workspaceId: $selectedWorkspace?.id! })}
    <div>
        <span class="loading-spinner loading-sm"></span>
        <span>Loading Models...</span>
    </div>
{:then unavaiableModels}
    {@const sortedModels = sortModelsByAvailability(unavaiableModels?.allNotAvaiableModels)}

    <UI.Common.AI.SelectAIModel
        bind:selectedModel={$selectedModelKey}
        avaiabaleModels={sortedModels}
        disabledModels={unavaiableModels?.allNotAvaiableModels}
        placeholder="Select model"
        onChange={onModelChange}
        disabled={!$canManageWorkspaceFiles}
        selectSize="sm"
    />
{:catch err}
    <div class="text-xs text-error">
        <span>Cannot download unavaiable models:</span>
        {err}
    </div>
{/await}