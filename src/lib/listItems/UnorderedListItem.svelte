<script lang="ts">
    import type { SpawnedList } from '$lib/stores/files';
    import EditableListItems from './EditableListItems.svelte';

    let {
        onEmptyList = () => {},
        spawnedList
    }: {
        onEmptyList?: () => void;
        spawnedList: SpawnedList
    } = $props();
</script>

<div class="custom-bullet-list-wrapper my-1">
    <EditableListItems
        kind="unordered"
        {spawnedList}
        {onEmptyList}
    />
</div>