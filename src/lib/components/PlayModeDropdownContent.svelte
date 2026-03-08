<script lang="ts">
    import Icon from '@iconify/svelte';
    import { File } from "@ravenlens/shared";

    let {
        selectedPlayMode,
        onSelect
    }: {
        selectedPlayMode: File.FileAI.PlayMode;
        onSelect?: (mode: File.FileAI.PlayMode) => void;
    } = $props();

    const playModes: { label: string; value: File.FileAI.PlayMode }[] = [
        { label: 'Run non-runned', value: 'run-non-runned' },
        { label: 'Run all', value: 'run-all' }
    ];

    const playModeIcons: Record<File.FileAI.PlayMode, string> = {
        'run-non-runned': 'material-symbols:play-arrow-outline-rounded',
        'run-all': 'material-symbols:playlist-play-rounded'
    };

    function handleSelect(event: MouseEvent, mode: File.FileAI.PlayMode) {
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