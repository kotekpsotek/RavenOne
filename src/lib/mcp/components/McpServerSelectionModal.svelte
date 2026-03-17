<script lang="ts">
    import { UI } from "@ravenlens/frontend";
    import _ from "lodash";

    interface Props {
        open: boolean;
        /** It's the list with MCP Servers are available to use */
        avaiableMCPServers: string[];
        /** It's bound list with MCP Server Names were specified */
        selectedMCPServerNames: string[];
        /** Event trigger when modal should go to close */
        close: () => void;
    }

    let {
        open = $bindable(false),
        selectedMCPServerNames = $bindable([]),
        avaiableMCPServers = [],
        close
    }: Props = $props();

    let newSelected = $state([...selectedMCPServerNames]);

    $effect(() => {
        if (open) {
            newSelected = [...selectedMCPServerNames];
        }
    });

    function onSelectCheckbox(forMCPServerName: string) {
        return (ev: Event) => {
            const currentTarget = ev.currentTarget as HTMLInputElement;

            if (currentTarget.checked) {
                newSelected = [
                    ...newSelected,
                    forMCPServerName
                ];
            }
            else {
                const forMcpServerNameIndex = newSelected.findIndex(selected => selected === forMCPServerName);

                if (forMcpServerNameIndex > -1) {
                    newSelected.splice(forMcpServerNameIndex, 1);
                    newSelected = newSelected;
                }
            }
        }
    }

    function onDecline() {
        newSelected = [...selectedMCPServerNames];
        close();
    }

    function onAccept() {
        selectedMCPServerNames = newSelected;
        close();
    }
</script>

{#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
        class="fixed inset-0 z-[60] bg-black/40"
        onclick={close}
    >
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="flex min-h-full items-center justify-center p-4" onclick={(event) => event.stopPropagation()}>
            <UI.Modals.ModalWrapper
                name="MCP Servers Selection"
                bind:open={open}
                closeOnBackdrop={true}
                size={"2xl"}
                on:close={close}
            >
                <UI.Modals.ModalWrapperHeading
                    headingName="MCP Servers Selection"
                    on:close={close}
                />

                {#if avaiableMCPServers.length}
                    <div
                        class="flex flex-wrap gap-4 mt-2"
                    >
                        {#each avaiableMCPServers as availableMCPServer}
                            <label class="label">
                                <input 
                                    type="checkbox"
                                    checked={newSelected.includes(availableMCPServer)}
                                    class="checkbox"
                                    onchange={onSelectCheckbox(availableMCPServer)}
                                />

                                <span>{availableMCPServer}</span>
                            </label>
                        {/each}
                    </div>

                    {#if !_.isEqual(_.sortBy(newSelected), _.sortBy(selectedMCPServerNames))}
                        <div
                            class="flex justify-end gap-5"
                        >
                            <button
                                class="btn btn-ghost"
                                onclick={onDecline}
                            >
                                Decline
                            </button>

                            <button
                                class="btn btn"
                                onclick={onAccept}
                            >
                                Accept
                            </button>
                        </div>
                    {/if}
                {:else}
                    <div
                        class="p-2 border border-dashed mt-2"
                    >
                        <h2 class="text-lg font-bold">There isn't available MCP Servers for this workspace</h2>
                        <p>Go and configure available servers at <b>MCP Servers (Card)</b> on <a class="text-sky-500 hover:underline" href="/workspace-settings/ai-models">Workpace Settings > AI Models</a></p>
                    </div>
                {/if}
            </UI.Modals.ModalWrapper>
        </div>
    </div>
{/if}
