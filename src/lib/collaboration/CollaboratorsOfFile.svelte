<script lang="ts">
    import CollaboratorsBubbles from "$lib/components/CollaboratorsBubbles.svelte";
	import { fileCollaborators } from "$lib/stores/collaboration";
</script>

<CollaboratorsBubbles
	collaborators={$fileCollaborators}
	MAX_VISIBLE_COLLABORATORS={5}
	size={"normal"}
	activeUserSuffix="File Editor"
/>
