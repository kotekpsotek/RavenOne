<script lang="ts">
    import { File } from '@ravenlens/shared';
    import EditableListItems from './EditableListItems.svelte';

    type SpawnedListEntry = File.File.SpawnedList["list"][number];

    let {
        onEmptyList = () => {},
        isReadOnly = false,
        spawnedList
    }: {
        onEmptyList?: () => void;
        isReadOnly?: boolean;
        spawnedList: SpawnedListEntry
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