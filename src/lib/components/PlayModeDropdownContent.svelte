<script lang="ts">
    import Icon from '@iconify/svelte';
    import type { PlayMode } from '$lib/editorComponents/types/AIList';

    let {
        selectedPlayMode,
        onSelect
    }: {
        selectedPlayMode: PlayMode;
        onSelect?: (mode: PlayMode) => void;
    } = $props();

    const playModes: { label: string; value: PlayMode }[] = [
        { label: 'Run non-runned', value: 'run-non-runned' },
        { label: 'Run all', value: 'run-all' }
    ];

    const playModeIcons: Record<PlayMode, string> = {
        'run-non-runned': 'material-symbols:play-arrow-outline-rounded',
        'run-all': 'material-symbols:playlist-play-rounded'
    };

    function handleSelect(event: MouseEvent, mode: PlayMode) {
        event.preventDefault();
        event.stopPropagation();

        if (onSelect) {
            onSelect(mode);
        }
    }
</script>

<div class="p-3 shadow bg-base-200 rounded-box border border-base-300 w-64 space-y-2">
    <p class="text-xs uppercase tracking-wide opacity-70">Mode</p>

    {#each playModes as mode (mode.value)}
        <button
            type="button"
            class="btn btn-sm justify-start w-full"
            class:btn-primary={selectedPlayMode === mode.value}
            class:btn-ghost={selectedPlayMode !== mode.value}
            onclick={(event) => handleSelect(event, mode.value)}
        >
            <Icon
                icon={selectedPlayMode === mode.value
                    ? 'material-symbols:check-box-rounded'
                    : 'material-symbols:check-box-outline-blank-rounded'}
                class="w-4 h-4"
            />
            <Icon icon={playModeIcons[mode.value]} class="w-4 h-4" />
            <span>{mode.label}</span>
        </button>
    {/each}
</div>