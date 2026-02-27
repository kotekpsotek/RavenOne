<script lang=ts>
    import { EditorContent } from "svelte-tiptap";
    import { editor } from "./stores/editor";
    import { selectedFile } from "./stores/files";
    import "./Editor.css";
    import { avaiableWorkspaces, isAddNewWorkspaceBtnDisabled, isWorkspaceInAddition, isWorkspaceSelectionOpen, selectedWorkspace } from "./stores/workspace";
    import { Workspace } from "@ravenlens/shared";
    import { UI } from "@ravenlens/frontend";
    import AddWorkspace from "./screens/AddWorkspace.svelte";

    function onSelectWorkspace(workspace: Workspace.Workspace.WorkspaceUserEntryLoaded) {
        return (ev?: Event) => {
            $selectedWorkspace = workspace;
        };
    }

    async function onAddNewWorkspace(ev?: Event) {
        $isWorkspaceSelectionOpen = false;
        $isWorkspaceInAddition = true;
    }

    function onSurroundingClick() {
        $isWorkspaceSelectionOpen = false;
    }
    
    function onContentClick(ev: Event) {
        ev.stopPropagation();
        $isWorkspaceSelectionOpen = false;
    }
</script>

<div class="relative w-full h-full">
    <!-- TODO: Refresh when subscription changes -->
    {#if $isWorkspaceSelectionOpen}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <section
            class="absolute inset-0 z-50 flex items-center justify-center py-3 bg-base-100/40 backdrop-blur-md"
            onclick={onSurroundingClick}
        >
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
                class="w-1/2 h-full relative"
                onclick={onContentClick}
            >
                <UI.Workspace.WorkspaceTray
                    open={$isWorkspaceSelectionOpen}
                    selectedWorkspace={$selectedWorkspace}
                    avaiableWorkspaces={$avaiableWorkspaces}
                    {onSelectWorkspace}
                    {onAddNewWorkspace}
                    newWorkspaceButtonDisabled={isAddNewWorkspaceBtnDisabled()}
                />
            </div>
        </section>
    {/if}

    <!-- Workspace Addition -->
    <AddWorkspace 
        bind:open={$isWorkspaceInAddition}
    />

    <!-- Editor -->
    {#if $editor}
        <div class="editor-container">
            <EditorContent editor={$editor} class="tiptap-editor" />
        </div>
    {/if}
</div>
