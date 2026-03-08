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

<div class="custom-ordered-list-wrapper my-1">
    <EditableListItems
        kind="ordered"
        {onEmptyList}
        {spawnedList}
    />
</div>