<script lang=ts>
    import { page } from "$app/stores";
    import { theme } from "$lib/stores/theme";
    import { selectedWorkspace } from "$lib/stores/workspace";
    import { workspaceCanAccessSettingsPath } from "$lib/workspace-settings/permissions";
    import Icon from "@iconify/svelte";
    import { UI } from "@ravenlens/frontend";
    import { avaiableOptions, optionURLToString, selectedOptionItem } from "./default";

    let { children } = $props();

    function onRedirectHandler(option: UI.Workspace.Settings.Types.AvaiableSettingOption) {
        return async () => {
            if (option.onClick) {
                return option.onClick(option);
            }
            

            const path = Array.isArray(option.url) ? option.url.at(-1) : option.url;
            window.location.assign(path ?? "");
        }
    }

    let canAccessCurrentSettingsPath = $derived($selectedWorkspace
        ? workspaceCanAccessSettingsPath($selectedWorkspace, $page.url.pathname)
        : false);
</script>

{#snippet SetTitleCard(item: UI.Workspace.Settings.Types.AvaiableSettingOption | undefined)}
    {#if item}
        <UI.Common.PageTitleCard
            icons={[
                {
                    name: item.iconProps?.icon,
                    classAllocation: "top-0 right-0 w-16 h-16",
                    color: $theme === "dark" ? "white" : ""
                }
            ]}
            cardName={item.nameTranslated ?? item.name}
        >
            <svelte:fragment slot="description">
                {item.description}
            </svelte:fragment>
        </UI.Common.PageTitleCard>
    {/if}
{/snippet}

<UI.Common.PageWrapper
    additionalClass="p-10"
>
    {#if $selectedWorkspace}
        {#if $avaiableOptions.length > 0}
            <div class="relative flex sm:flex-col sm:gap-10 lg:gap-0 lg:flex-row w-full h-full">
                <div 
                    class="left-panel sm:w-full sm:border lg:border-0 sm:rounded-lg lg:rounded-none sm:p-2 lg:w-fit sm:h-fit lg:h-screen left-side-stripe space-y-2 text-base-content/70 p-1 pl-0 lg:pr-4 lg:border-r border-gray-500/30"
                >
                    {#each $avaiableOptions as option (optionURLToString(option))}
                        <button 
                            class="w-full rounded-lg p-2 px-4 flex justify-start cursor-pointer gap-2 items-center justify-center transition-colors duration-200 hover:bg-gray-400/10 hover:text-base-content {option.isSelected ? "bg-gray-400/10 text-base-content" : ""}"
                            class:selected={$page.url.pathname.endsWith(optionURLToString(option))}
                            onclick={onRedirectHandler(option)}
                        >
                            <Icon
                                icon={option.iconProps?.icon}
                            />
                            
                            <span>
                                {option.name}
                            </span>
                        </button>
                    {/each}
                </div>

                <div class="right-panel flex-1 lg:pl-4 pb-4 flex flex-col gap-10 overflow-y-auto">
                    {#if canAccessCurrentSettingsPath}
                        {#if $selectedOptionItem && $selectedOptionItem.name !== "Workspace Members"}
                            {@render SetTitleCard($selectedOptionItem)}
                        {/if}
                        {@render children()}
                    {:else}
                        <div class="w-full h-full flex gap-2 items-center justify-center text-base-content/70">
                            <span>You do not have permission to this settings section.</span>
                        </div>
                    {/if}
                </div>
            </div>
        {:else}
            <div class="w-full h-full flex items-center justify-center text-base-content/70">
                You do not have permission to view workspace settings.
            </div>
        {/if}
    {:else}
        <div
            class="w-screen h-screen flex gap-2 items-center justify-center"
        >
            <span class="loading loading-spinner loading-xs"></span>
            <span>Loading workspace settings...</span>
        </div>
    {/if}
</UI.Common.PageWrapper>

<style>
    .selected {
        background-color: hsl(var(--b3));
    }
</style>
