<script lang=ts>
    import { PUBLIC_SOCKET_IO_PLAY_CONNECTION_URL } from "$env/static/public";
    import { selectedFile } from "$lib/stores/files";
    import { liveExecutionResultsStore, selectedSpikeRoutineDocument, selectedTab } from "$lib/stores/lists";
    import { selectedWorkspace } from "$lib/stores/workspace";
    import { fetchAuthenticated } from "$lib/utils/fetch";
    import Icon from "@iconify/svelte";
    import { File } from "@ravenlens/shared";
    import { get } from "svelte/store";
    import { getTitle } from "./utils";

    // Local stores
    let editTitleDocumentId = $state<string | null>(null);
    let titleRanameValue = $state<string>("");
    let renamedDocumentNames = $state<Record<string, string>>({});

    function getDocumentName(document: File.RoutinesSpikes.FrontendDownloadResultObject["resultDocumentsHTML"][number]): string {
        return renamedDocumentNames[document.id] ?? document.documentName;
    }

    function normalizeResult(result: File.RoutinesSpikes.FrontendDownloadResultObject): File.RoutinesSpikes.FrontendDownloadResultObject {
        return {
            ...result,
            date: new Date(result.date)
        };
    }

    function createResultIdentity(result: File.RoutinesSpikes.FrontendDownloadResultObject): string {
        const normalizedResult = normalizeResult(result);
        const documentIds = normalizedResult.resultDocumentsHTML.map((document) => document.id).join("|");

        return `${normalizedResult.title}|${normalizedResult.date.getTime()}|${documentIds}`;
    }

    function mergeResults(
        downloadedResults: File.RoutinesSpikes.FrontendDownloadResultObject[],
        liveResults: File.RoutinesSpikes.FrontendDownloadResultObject[]
    ): File.RoutinesSpikes.FrontendDownloadResultObject[] {
        const dedupedResultsByIdentity: Record<string, File.RoutinesSpikes.FrontendDownloadResultObject> = {};
        const identitiesInOrder: string[] = [];

        for (const result of [...liveResults, ...downloadedResults]) {
            const normalizedResult = normalizeResult(result);
            const identity = createResultIdentity(normalizedResult);

            if (!(identity in dedupedResultsByIdentity)) {
                dedupedResultsByIdentity[identity] = normalizedResult;
                identitiesInOrder.push(identity);
            }
        }

        return identitiesInOrder.map((identity) => dedupedResultsByIdentity[identity]);
    }

    const selectedFileLiveResultsCount = $derived(($liveExecutionResultsStore[$selectedFile?.id ?? ""] ?? []).length);

    // Utils
    async function donwloadResults(): Promise<File.RoutinesSpikes.FrontendDownloadResultObject[]> {
        const selectedFileId = get(selectedFile)?.id;
        const liveResults = liveExecutionResultsStore.getResultsForFile(selectedFileId ?? "");

        try {
            const mode = get(selectedTab).toLocaleLowerCase();
            const fetchResult = await fetchAuthenticated(
                `${PUBLIC_SOCKET_IO_PLAY_CONNECTION_URL}/routines-spikes/${mode}/download-results`,
                {
                    method: "POST",
                    headers: {
                        'Content-Type': "application/json"
                    },
                    body: JSON.stringify({
                        fileId: get(selectedFile)?.id,
                        workspaceId: get(selectedWorkspace)?.id
                    })
                }
            );

            if (fetchResult) {
                const results = await fetchResult.json() as File.RoutinesSpikes.FrontendDownloadResultObject[];

                return mergeResults(results, liveResults);
            }
        }
        catch(err) {
            console.error('Cannot download results', err);
        }

        // Default
        const fallbackResults = [
            {
                title: "Execution Result title",
                resultDocumentsHTML: [
                    {
                        id: 'document-id-1',
                        documentName: "Document Name",
                        documentHTML: `Tommy Hilfiger is an American fashion brand known for its classic, preppy style with a modern twist. Founded by designer Tommy Hilfiger, the brand became widely recognized for combining casual American fashion with premium quality and bold red, white, and blue branding. It offers clothing, footwear, accessories, and fragrances for men, women, and children, and is associated with a youthful, polished lifestyle.





What is Lamborghini?

Automobili Lamborghini S.p.A. is an Italian manufacturer of high‑performance luxury sports cars and SUVs. Founded in 1963 and based in Sant'Agata Bolognese, Italy, Lamborghini is famous for bold, angular styling, powerful V10/V12 engines, and iconic models such as the Miura, Countach, Aventador, and Huracán.

Why was Lamborghini established?

Ferruccio Lamborghini, a successful industrialist (notably of Lamborghinis tractors), founded the company to build refined, reliable grand‑touring and high‑performance cars. Key reasons were: (1) his personal passion for automobiles; (2) a desire to create cars that could rival Ferrari in comfort and performance; and (3) frustration with mechanical issues and customer service he experienced with existing sports cars, which motivated him to build better alternatives. Early models like the 350 GT and the groundbreaking mid‑engine Miura (1966) helped establish Lamborghini as a leader in exotic sports‑car design.

For official information, see Lamborghini official site.>`,
                        generatedForPointIds: ['point1', 'point10']
                    },
                    {
                        id: 'document-id-2',
                        documentName: "Document Name",
                        documentHTML: `<h1>Hello</h1><p></p>`,
                        generatedForPointIds: ['point1', 'point10']
                    },
                ],
                date: new Date()
            },
            {
                title: "Execution Result title",
                resultDocumentsHTML: [
                    {
                        id: 'document-id-3',
                        documentName: "Document Name",
                        documentHTML: `<h1>Hello</h1><p></p>`,
                        generatedForPointIds: ['point1', 'point10']
                    }
                ],
                date: new Date()
            },
        ];

        return mergeResults(fallbackResults, liveResults);
    }

    function focusInputAttachment(node: HTMLInputElement) {
        queueMicrotask(() => {
            node.focus();
            node.select();
        });
    }

    // Handlers
    function onEditTitle(document: File.RoutinesSpikes.FrontendDownloadResultObject["resultDocumentsHTML"][number]) {
        return (ev: Event) => {
            ev.stopPropagation();
            
            editTitleDocumentId = document.id;
            titleRanameValue = getDocumentName(document)
        }
    }

    async function submitRename(documentId: string) {
        const nextName = titleRanameValue.trim();

        if (!nextName) {
            cancelRename();
            return;
        }

        // TODO: Send request to backend to rename the document with specified id

        
        // Updates locally after backend success
        renamedDocumentNames = {
            ...renamedDocumentNames,
            [documentId]: nextName
        };

        selectedSpikeRoutineDocument.update((document) => {
            if (!document || document.id !== documentId) {
                return document;
            }

            return {
                ...document,
                documentName: nextName
            };
        });


        // Cancel
        editTitleDocumentId = null;
        titleRanameValue = "";
    }

    function cancelRename() {
        editTitleDocumentId = null;
        titleRanameValue = "";
    }
</script>

{#snippet Document(document: File.RoutinesSpikes.FrontendDownloadResultObject["resultDocumentsHTML"][number])}
    {@const hasDocumentManipulationPermission = $selectedWorkspace?.userPermissions.includes("manage_files") || $selectedWorkspace?.isOwner}

    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
        class="document w-full flex items-center justify-between gap-5 p-2 rounded-lg hover:bg-base-200 cursor-pointer"
        class:bg-base-300={document.id === $selectedSpikeRoutineDocument?.id}
        data-document-id={document.id}
        onclick={(e) => {
            if ((e.target as HTMLElement).closest('button, input')) return;
            selectedSpikeRoutineDocument.onSelectDocument({ ...document, documentName: getDocumentName(document) })();
        }}
    >
        {#if editTitleDocumentId === document.id}
            <div 
                class="flex items-center gap-1 w-3/4"
            >
                <input
                    {@attach focusInputAttachment}
                    class="input input-sm text-sm w-full max-w-52 border-none outline-none bg-transparent"
                    bind:value={titleRanameValue}
                    onclick={ev => ev.stopPropagation()}
                    onkeydown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') {
                            submitRename(document.id);
                        } else if (e.key === 'Escape') {
                            cancelRename();
                        }
                    }}
                />
                
                <div
                    class="flex gap-1 items-center"
                >
                    <button
                        class="submit-rename btn btn-ghost btn-square btn-xs"
                        onclick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            submitRename(document.id);
                        }}
                        aria-label="Accept rename"
                    >
                        <Icon icon="material-symbols:check-rounded" class="text-lg"/>
                    </button>

                    <button
                        class="cancel-rename btn btn-ghost btn-square btn-xs"
                        onclick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            cancelRename();
                        }}
                        aria-label="Cancel rename"
                    >
                        <Icon icon="material-symbols:close-rounded" class="text-lg"/>
                    </button>
                </div>
            </div>
        {:else}
            <div
                class="flex items-center gap-2"
            >
                <Icon
                    icon="material-symbols:text-snippet"
                />
                <span>{getDocumentName(document)}</span>
            </div>
        {/if}

        {#if hasDocumentManipulationPermission && !editTitleDocumentId}
            <button
                class="edit-document-title btn btn-xs btn-outline border-gray-500 text-gray-500"
                title="Edit Document Title"
                onclick={onEditTitle(document)}
            >
                <Icon
                    icon="material-symbols:edit-outline-rounded"
                />
            </button>
        {/if}
    </div>
{/snippet}

{#key `${$selectedTab}-${$selectedFile?.id ?? 'none'}-${selectedFileLiveResultsCount}`}
    <section class="execution-results h-full overflow-y-auto bg-base-100 p-4">
        <div class="mb-4 flex items-center gap-2 border-b border-base-300 pb-3">
            <Icon icon="material-symbols:checklist-rtl-rounded" class="text-lg text-base-content" />
            <h3 class="text-sm font-semibold tracking-wide text-base-content">Execution Results</h3>
        </div>

        {#await donwloadResults()}
            <div class="flex items-center justify-center w-full h-full">
                <span class="loading-spinner loading-sm"></span>
                <span>Loading Results...</span>
            </div>
        {:then results}
            <div class="space-y-2 h-full">
                {#if results.length}
                    {#each results as result, resultIndex (`${result.title}-${result.date.getTime()}-${resultIndex}`)}
                        <details class="collapse collapse-arrow bg-base-100 border-base-300 border">
                            <summary class="collapse-title font-semibold cursor-pointer">
                                {getTitle(result)}
                            </summary>

                            <div class="collapse-content text-sm">
                                {#each result.resultDocumentsHTML as document (document.id)}
                                    {@render Document(document)}
                                {/each}
                            </div>
                        </details>
                    {/each}
                {:else}
                    <div class="flex items-center text-sm justify-center w-full h-full">
                        <span>There isn't any execution result</span>
                    </div>
                {/if}
            </div>
        {:catch err}
            <div class="flex items-center justify-center w-full h-full">
                <p class="text-error">Cannot load results</p>
            </div>
        {/await}
    </section>
{/key}