<script lang="ts">
    import { selectedFile } from '$lib/stores/files';
    import { selectedSpikeRoutineDocument, selectedTab } from '$lib/stores/lists';
    import { createEditor, EditorContent } from 'svelte-tiptap';
    import { File } from "@ravenlens/shared";
    import Icon from '@iconify/svelte';
    import StarterKit from '@tiptap/starter-kit';

    const editor = createEditor({
        content: $selectedSpikeRoutineDocument?.documentHTML,
        editable: false,
        extensions: [StarterKit]
    });

    // Register change of selected document within editor
    selectedSpikeRoutineDocument.subscribe(change => {
        $editor.commands.setContent(change?.documentHTML ?? "");
    })

    // FIXME: Instead of seeking in current document we can in future remember the old points to seek on list of old points
    function getPointNameById(pointId: string): { name: string, nonResolved?: boolean; fullPoint?: File.File.EditableListItemItself } {
        const tabMode = $selectedTab;

        const pointField = (() => {
            if (tabMode === "Spikes") {
                return $selectedFile?.spikes;
            }
            else if (tabMode === "Routines") {
                return $selectedFile?.routines;
            }
        })() ?? [];

        let pointPositionOnList: null | number = null;
        const listMatched = pointField.find(list => {
            const idPoint = list.items.findIndex(point => point.id === pointId);
            if (idPoint > -1) {
                pointPositionOnList = idPoint;
                return true;
            }
        });

        if (listMatched && pointPositionOnList !== null) {
            const fullPoint = listMatched.items[pointPositionOnList];
            const itemText = fullPoint.text;
            const showCount = 7;
            
            return {
                name: `${itemText.slice(0, showCount)}${itemText.length > 7 ? "..." : ""}`.trim(),
                fullPoint: fullPoint
            };
        }

        //
        return {
            name: `${pointId} (nonresolved)`,
            nonResolved: true
        };
    }

    function onGoBack() {
        selectedSpikeRoutineDocument.unselect();    
    }
</script>

{#snippet DocumentHeadingElement()}
    <div id="heading-routine-and-spikes">
        <div
            class="flex justify-between items-center"
        >
            <h2 class="font-bold text-3xl">{$selectedSpikeRoutineDocument?.documentName}</h2>
            <div>
                <button
                    class="btn btn-xs btn-outline border-gray-400 text-gray-400 flex items-center gap-1"
                    onclick={onGoBack}
                >
                    <Icon icon="material-symbols:arrow-left-alt-rounded"/>
                    <span>Go Back</span>
                </button>
            </div>
        </div>
        
        <div 
            id="points-list"
            class="flex gap-2 items-center py-2 text-gray-500"
        >
            <Icon icon="material-symbols:check-box"/>
            <div
                id="list"
                class="flex gap-1"
            >
                {#each $selectedSpikeRoutineDocument?.generatedForPointIds ?? [] as pointId}
                    {@const pointName = getPointNameById(pointId)}
                    <button
                        class="point p-1 hover:bg-base-300 rounded-lg text-sm cursor-pointer"
                        title={pointName.nonResolved ? `Point Doesn't exists currently in ${$selectedTab}` : pointName.fullPoint?.text ?? "Cannot find point" }
                    >
                        <span>{pointName.name}</span>
                    </button>
                {/each}
            </div>
        </div>
    </div>
{/snippet}

<div 
    id="document-routines-spikes"
    class="flex flex-col gap-2"
>
    {@render DocumentHeadingElement()}

    <EditorContent
        editor={$editor}
    />
</div>
