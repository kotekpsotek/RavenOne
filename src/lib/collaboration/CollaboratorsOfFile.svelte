<script lang="ts">
	import { Collabortation } from "@ravenlens/shared";
	import { fileCollaborators } from "$lib/stores/collaboration";
    import { UI } from "@ravenlens/frontend";

	type Collaborator = Collabortation.CollabEditor | Collabortation.CollabUser;

	const MAX_VISIBLE_COLLABORATORS = 5;

	const visibleCollaborators = $derived($fileCollaborators.slice(0, MAX_VISIBLE_COLLABORATORS));
	const collaboratorNames = $derived(
		$fileCollaborators
			.map((collaborator) => getCollaboratorName(collaborator))
			.filter(Boolean)
			.join(", ")
	);

	function isEditor(collaborator: Collaborator): collaborator is Collabortation.CollabEditor {
		return "isEditor" in collaborator && collaborator.isEditor === true;
	}

	function getCollaboratorName(collaborator: Collaborator) {
		return `${collaborator.name?.trim() || "Unknown collaborator"} ${isEditor(collaborator) ? '(File Editor)' : ""}`.trim();
	}
</script>

{#if visibleCollaborators.length > 0}
	<div
		class="flex h-9 items-center"
		title={collaboratorNames}
		aria-label={`Collaborators: ${collaboratorNames}`}
	>
		{#each visibleCollaborators as collaborator, index (collaborator.id)}
			<div
				class={`relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-base-300 ${
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
