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

<div class="custom-ordered-list-wrapper my-1">
    <EditableListItems
        kind="ordered"
        {isReadOnly}
        {onEmptyList}
        {spawnedList}
    />
</div>