<script lang="ts">
    import Icon from '@iconify/svelte';
    import clsx from 'clsx';
    import { triggerPlay } from '$lib/state.svelte';
    
    // Mock state for these UI elements for now
    let mode = $state<'ask' | 'agentic'>('agentic');
    let docType = $state('Document'); 
</script>

<div class="h-16 flex items-center justify-between px-6 border-b border-base-300 bg-base-100">
    <!-- Left Side (Breadcrumbs or Empty) -->
    <div class="flex items-center gap-2">
        <!-- Could put breadcrumbs here -->
    </div>

    <!-- Right Side -->
    <div class="flex items-center gap-6">
        
        <!-- Plugins -->
        <button class="btn btn-ghost hover:bg-base-200 gap-2 normal-case font-normal text-base-content/80 hover:text-base-content">
            <Icon icon="material-symbols:extension-outline" class="w-5 h-5" />
            <span>Plugins</span>
        </button>

        <!-- Templates (Document/Routine Select in prompt explanation seems intertwined with Templates or adjacent) -->
        <!-- User said: "Templates - user can use this button to select..." AND "Document / OneRoutine - it's the <select>..." -->
        
        <button class="btn btn-ghost hover:bg-base-200 gap-2 normal-case font-normal text-base-content/80 hover:text-base-content">
             <!-- Icon for template? -->
            <span>Document / Routine</span>
        </button>

         <!-- Document Type Select -->
         <select class="select select-ghost select-sm w-40 font-normal focus:bg-base-200">
            <option>Document</option>
            <option>OneRoutine</option>
         </select>


        <!-- Mode Selection -->
        <div class="flex items-center bg-base-200 rounded-lg p-1">
             <button 
                class={clsx("px-3 py-1 rounded-md text-sm transition-colors", mode === 'ask' ? "bg-base-100 shadow-sm font-medium" : "hover:bg-base-300/50")}
                onclick={() => mode = 'ask'}
            >
                Ask
            </button>
             <button 
                class={clsx("px-3 py-1 rounded-md text-sm transition-colors", mode === 'agentic' ? "bg-base-100 shadow-sm font-medium" : "hover:bg-base-300/50")}
                onclick={() => mode = 'agentic'}
            >
                Agentic
            </button>
        </div>

        <!-- Play Button -->
        <button class="btn btn-primary gap-2 rounded-full px-6 text-white min-h-[2.5rem] h-10" onclick={triggerPlay}>
            <Icon icon="material-symbols:play-arrow" class="w-5 h-5" />
            Play
        </button>

        <!-- Add Button (from the image "Add" with + icon) -->
        <!-- The user prompt mentioned "upper stripe... Plugin buttons... Templates... Document/OneRoutine... Mode... Play". -->
        <!-- The image has a "+ Add" button on the far right. I'll add that. -->
        <button class="btn btn-ghost gap-2 normal-case">
            <Icon icon="material-symbols:add" class="w-5 h-5" />
            Add
        </button>

    </div>
</div>
