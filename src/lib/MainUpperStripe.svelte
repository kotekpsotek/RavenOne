<script>
    import Icon from "@iconify/svelte";
    import { selectedFile } from "./stores/files";
    import { avaiableModels, getProviderIconifyIcon } from "./config/models";
    import { selectedModel } from "./stores/selected";

    function onShareFile() {

    }

    function onPlay() {

    }
</script>

{#if $selectedFile}
<section 
    id="upperstripe"
    class="border-b border-base-300 bg-base-100 flex items-center justify-between px-4 py-1.5 transition-colors"
>
    <div class="rigth-side"></div>

    <div
        class="left-side flex gap-10"
    >
            <div
                id="operations"
                class="flex gap-1"
            >
                <select 
                    class="select select-primary"
                    name="model-selection"
                    id="model-selection"
                    bind:value={$selectedModel}
                >
                    <option value="" disabled selected>Select Model</option>
                
                    {#each avaiableModels as model}
                        <option
                            value="{model.provider}-{model.name}"
                        >
                            <Icon icon={getProviderIconifyIcon(model.provider)}/>

                            <span>{model.name}</span>

                            {#if model.isThinking}
                                <span
                                    class="badge badge-outline"
                                >
                                    Thinking
                                </span>
                            {/if}
                        </option>
                    {/each}
                </select>
            
                <button
                    class="button button-primary cursor-pointer"
                    onclick={onPlay}
                >
                    <Icon 
                        icon="material-symbols:play-circle-outline-rounded"
                        class="w-6 h-6"
                    />
                </button>
            </div>
        
            <button>
                Share
            </button>
        </div>
    </section>
{/if}
    