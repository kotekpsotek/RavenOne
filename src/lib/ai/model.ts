import { browser } from "$app/environment";
import { avaiableModels } from "$lib/config/models";
import { get, writable } from "svelte/store";

export const selectedModelKey = (() => {
    const initialModelKey = avaiableModels[0]?.model ?? "";
    const selectedModelName = writable<string>(initialModelKey);

    if (browser) {
        const model = localStorage.getItem("localSelectedLLM");
        selectedModelName.set(model ?? initialModelKey);
    }

    return {
        ...selectedModelName,
        set(model: string) {
            if (browser) {
                localStorage.setItem('localSelectedLLM', model);
            }
            
            selectedModelName.set(model ?? initialModelKey);
        }
    }
})();

export const modelWeights = (() =>{
    const { ...all } = writable<Record<string, number>>(get(selectedModelKey) ? { [get(selectedModelKey)]: 1 } : {});
    
    return {
        ...all
    }
})();
