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

<div class="custom-task-list-wrapper my-1">
    <EditableListItems 
        kind="task"
        {isReadOnly}
        {spawnedList}
        {onEmptyList}
    />
</div>