<script lang="ts">
    import type { File } from '$lib/sharedCompat';
    import EditableListItems from './EditableListItems.svelte';

    let {
        onEmptyList = () => {},
        isReadOnly = false,
        spawnedList
    }: {
        onEmptyList?: () => void;
        isReadOnly?: boolean;
        spawnedList: File.File.SpawnedList
    } = $props();
</script>

<div class="custom-ordered-list-wrapper my-1">
    <EditableListItems
        kind="ordered"
        {isReadOnly}
        {onEmptyList}
        {spawnedList}
    />
</div>