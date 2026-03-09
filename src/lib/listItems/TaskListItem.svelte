<script lang="ts">
    import { File } from '@ravenlens/shared';
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