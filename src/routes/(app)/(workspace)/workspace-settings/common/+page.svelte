<script lang="ts">
    import { UI } from "@ravenlens/frontend";
    import { onDestroy, type ComponentProps } from "svelte";
    import { selectedWorkspace } from "$lib/stores/workspace";
    import { sendDeleteWorkspace, sendSaveWorkspaceChanges } from "$lib/workspace-settings/connections";
    
    // Workspace state (should be loaded from backend in real app)
    $: workspaceName = $selectedWorkspace?.name;
    $: originalWorkspaceName = workspaceName;

    // Profile image handling
    let profileImageUrl: string | null = null; // existing image URL
    let profilePreviewUrl: string | null = null; // object URL for preview (optional)

    // UI state
    let editing = false;

    // Delete workspace flow
    let showDeleteSection = false;
    let deleteConfirmInput = "";
    let deleting = false;

    $: deleteInputMatches = deleteConfirmInput === originalWorkspaceName;

    function openDelete() {
        showDeleteSection = true;
        deleteConfirmInput = "";
    }

    function onCancelDelete() {
        showDeleteSection = false;
        deleteConfirmInput = "";
    }

    async function onConfirmDelete() {
        if (!deleteInputMatches) return;
        
        deleting = true;
        try {
            // Call to backend
            const resultDeletion = await sendDeleteWorkspace();
            
            // After deletion you'd redirect the user. For now we just simulate.
            if (resultDeletion) {
                deleting = false;
            }
        } catch {
            deleting = false;
        }
    }

    const onSaveWorkspaceChange: ComponentProps<UI.Common.ProfileCard>["onSaveChange"] = async (name, image) => {
        workspaceName = name;

        try {
            // call API to upload image and update workspace name
            const savedResult = await sendSaveWorkspaceChanges(name, image);

            //
            if (savedResult) {
                if (image?.previewURL) {
                    // In a real app the server returns a hosted URL. We use preview url for now.
                    profileImageUrl = image.previewURL;
                    profilePreviewUrl = null;
                }
    
                originalWorkspaceName = workspaceName;
                editing = false;
            }
        }
        catch(err: any) {}
    }

    onDestroy(() => {
        if (profilePreviewUrl) URL.revokeObjectURL(profilePreviewUrl);
    });
</script>

<div class="space-y-6">
    {#if profilePreviewUrl}
        <UI.Common.ProfileCard
            name={workspaceName!}
            profileName={$selectedWorkspace?.name}
            profileImgURL={$selectedWorkspace?.imageUrl}
            label="Workspace"
            editionDescription="Customize workspace appearance and basic settings."
            {profileImageUrl}
            {profilePreviewUrl}
            profileImageErrorHandler={() => UI.Common.Avatar.onWorkspaceAvatarError(workspaceName!)}
            onSaveChange={onSaveWorkspaceChange}
        />
    {:else}
        <UI.Common.ProfileCard
            name={workspaceName!}
            profileName={$selectedWorkspace?.name}
            profileImgURL={$selectedWorkspace?.imageUrl}
            label="Workspace"
            editionDescription="Customize workspace appearance and basic settings."
            {profileImageUrl}
            
            {profilePreviewUrl}
            profileImageErrorHandler={() => UI.Common.Avatar.onWorkspaceAvatarError(workspaceName!)}
            onSaveChange={onSaveWorkspaceChange}
        />
    {/if}

    <div class="bg-base-100 rounded-2xl p-5 space-y-4 border border-error/30">
        <div class="flex items-center justify-between">
            <div>
                <div class="text-lg font-semibold text-error">Danger zone</div>
                <div class="text-sm text-base-content/60 mt-1">Remove this workspace permanently. This action cannot be undone.</div>
            </div>
            <div>
                <button class="btn btn-outline btn-error hover:text-white" on:click={openDelete}>Remove workspace</button>
            </div>
        </div>
    </div>
</div>

<!-- Delete Workspace Modal -->
<UI.Modals.ModalWrapper
    name="Delete Workspace"
    size="xl"
    bind:open={showDeleteSection}
>
    <UI.Modals.ModalWrapperHeading
        headingName="Delete Workspace"
        description={`This action cannot be undone. <span class="underline">This will permanently delete the workspace and all its data.</span>`}
        bind:open={showDeleteSection}
    />

    <div class="mt-5">
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label class="text-sm font-medium text-base-content/80 mb-2 block">
            Type the workspace name <strong>{originalWorkspaceName}</strong> to confirm:
        </label>
        <input 
            class="input input-bordered w-full" 
            placeholder="Workspace name" 
            bind:value={deleteConfirmInput} 
        />
    </div>

    <div class="modal-action">
        <button class="btn btn-ghost" on:click={onCancelDelete}>Cancel</button>
        <button 
            class="btn btn-error text-white" 
            on:click={onConfirmDelete} 
            disabled={deleteConfirmInput !== originalWorkspaceName || deleting}
        >
            {#if deleting}
                <span class="loading loading-spinner loading-sm"></span>
                Deleting...
            {:else}
                Delete Workspace
            {/if}
        </button>
    </div>
</UI.Modals.ModalWrapper>
