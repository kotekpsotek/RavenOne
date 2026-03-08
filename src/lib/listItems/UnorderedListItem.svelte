<script lang="ts">
    import { File } from '@ravenlens/shared';
    import EditableListItems from './EditableListItems.svelte';

    let {
        onEmptyList = () => {},
        spawnedList
    }: {
        onEmptyList?: () => void;
        spawnedList: File.File.SpawnedList
    } = $props();
</script>

<div class="custom-bullet-list-wrapper my-1">
    <EditableListItems
        kind="unordered"
        {spawnedList}
        {onEmptyList}
    />
</div>