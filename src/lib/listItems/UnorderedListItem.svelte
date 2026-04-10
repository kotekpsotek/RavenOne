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

<div class="custom-bullet-list-wrapper my-1">
    <EditableListItems
        kind="unordered"
        {isReadOnly}
        {spawnedList}
        {onEmptyList}
    />
</div>