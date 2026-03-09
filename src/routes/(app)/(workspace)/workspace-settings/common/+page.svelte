<script lang="ts">
    import { workspaceHasActiveSubscription, workspaceSubscriptionCheckInProgress } from "$lib/stores/subscription";
    import { UI } from "@ravenlens/frontend";
    import { onDestroy, type ComponentProps } from "svelte";
    import { selectedWorkspace } from "$lib/stores/workspace";
    import { setAlert } from "$lib/utils/alert";
    import { sendDeleteWorkspace, sendSaveWorkspaceChanges } from "$lib/workspace-settings/connections";
    
    // Workspace state (should be loaded from backend in real app)
        let workspaceName = $state("");
        let originalWorkspaceName = $state("");

    // Profile image handling
    let profileImageUrl = $state<string | null>(null); // existing image URL
    let profilePreviewUrl = $state<string | null>(null); // object URL for preview (optional)

    // UI state
    let editing = $state(false);

    // Delete workspace flow
    let showDeleteSection = $state(false);
    let deleteConfirmInput = $state("");
    let deleting = $state(false);

    const canEditWorkspaceSettings = $derived(!$workspaceSubscriptionCheckInProgress && $workspaceHasActiveSubscription);
    const deleteInputMatches = $derived(deleteConfirmInput === originalWorkspaceName);

    $effect(() => {
        const selectedWorkspaceName = $selectedWorkspace?.name ?? "";
        workspaceName = selectedWorkspaceName;
        originalWorkspaceName = selectedWorkspaceName;
    });

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
        if (!canEditWorkspaceSettings) {
            setAlert("warning", "Active workspace subscription required", "Cannot edit workspace name or image because this workspace has no active subscription.");
            return;
        }

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
    <div class="relative">
        <div class={!canEditWorkspaceSettings ? "pointer-events-none opacity-60" : ""}>
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
        </div>

        {#if !canEditWorkspaceSettings && !$workspaceSubscriptionCheckInProgress}
            <div class="absolute inset-0 z-10 flex items-start justify-center p-4">
                <div class="alert alert-warning max-w-2xl text-sm">
                    Active workspace subscription is required to edit workspace name and image.
                </div>
            </div>
        {/if}
    </div>

    <div class="bg-base-100 rounded-2xl p-5 space-y-4 border border-error/30">
        <div class="flex items-center justify-between">
            <div>
                <div class="text-lg font-semibold text-error">Danger zone</div>
                <div class="text-sm text-base-content/60 mt-1">Remove this workspace permanently. This action cannot be undone.</div>
            </div>
            <div>
                <button class="btn btn-outline btn-error hover:text-white" onclick={openDelete}>Remove workspace</button>
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
        <button class="btn btn-ghost" onclick={onCancelDelete}>Cancel</button>
        <button 
            class="btn btn-error text-white" 
            onclick={onConfirmDelete} 
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
