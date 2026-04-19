<script lang="ts">
	import type { CollabEditor } from "$lib/sharedCompat";
    import { UI } from "@ravenlens/frontend";
    import type { Collaborator } from "./CollaboratorsBubble.types";

    let {
        collaborators,
        MAX_VISIBLE_COLLABORATORS = 5,
        size = "normal",
        activeUserSuffix
    }: {
        collaborators: Collaborator[];
        MAX_VISIBLE_COLLABORATORS: number;
        size: "normal" | "small"
        activeUserSuffix: string
    } = $props();

    const visibleCollaborators = $derived(collaborators.slice(0, MAX_VISIBLE_COLLABORATORS));
    const collaboratorNames = $derived(
		collaborators
			.map((collaborator) => getCollaboratorName(collaborator))
			.filter(Boolean)
			.join(", ")
	);
    const sizeUnit = $derived(size === "normal" ? "6" : "5");

    function getCollaboratorName(collaborator: Collaborator) {
		return `${collaborator.name?.trim() || "Unknown collaborator"} ${isEditor(collaborator) ? `(${activeUserSuffix})` : ""}`.trim();
	}

    function isEditor(collaborator: Collaborator): collaborator is CollabEditor {
		return "isEditor" in collaborator && collaborator.isEditor === true;
	}
</script>

{#if collaborators.length > 0}
	<div
		class="flex h-9 items-center"
		title={collaboratorNames}
		aria-label={`Collaborators: ${collaboratorNames}`}
	>
		{#each visibleCollaborators as collaborator, index (collaborator.id)}
			<div
				class={`relative flex h-${sizeUnit} w-${sizeUnit} items-center justify-center overflow-hidden rounded-full bg-base-300 ${
					index > 0 ? "-ml-3" : ""
				} ${
					isEditor(collaborator)
						? "ring-2 ring-sky-400 border border-base-100"
						: "ring-2 ring-base-100 border border-base-300"
				}`}
				style={`z-index: ${visibleCollaborators.length - index};`}
			>
				<UI.Common.AvatarComponent.ProfileAvatar
                    name={collaborator.name}
                    profileImgURL={collaborator.profileImgURL}
                />
			</div>
		{/each}
	</div>
{/if}