<script lang="ts">
    import { onMount } from "svelte";
    import Icon from "@iconify/svelte";
    import CodeMirror from "svelte-codemirror-editor";
    import { json } from "@codemirror/lang-json";
    import { oneDark } from "@codemirror/theme-one-dark";
    import { UI } from "@ravenlens/frontend";
    import ModalScreen from "./ModalScreen.svelte";
    import { selectedWorkspace } from "$lib/stores/workspace";
    import { selectedTab } from "$lib/stores/lists";
    import { selectedFile } from "$lib/stores/files";
    import { userProfile } from "$lib/stores/user";
    import { theme } from "$lib/stores/theme";
    import { alertState } from "$lib/utils/alert";
    import { fetchAuthenticated } from "$lib/utils/fetch";
    import { File } from "@ravenlens/shared";
    import { PUBLIC_SOCKET_IO_PLAY_CONNECTION_URL } from "$env/static/public";

    type Routine = File.RoutinesSpikesConfig.RoutineConfig;
    type ExecuteFor = File.RoutinesSpikesConfig.ExecuteFor;

    type RoutineDraft = {
        name: string;
        invokeType: Routine["invokeTime"]["type"];
        hours: string;
        days: string;
        weeks: string;
        executeForMode: "all" | "specific";
        executeForRaw: string;
    };

    let {
        open = $bindable(false)
    }: { open: boolean } = $props();

    let routines = $state<Routine[]>([]);
    let loadingRoutines = $state(false);
    let loadError = $state<string | null>(null);

    let editionRoutineId: string | undefined = $state(undefined);
    let draftByRoutineId = $state<Record<string, RoutineDraft>>({});
    let newRoutineId: string | undefined = $state(undefined);

    let loadRequestId = 0;

    onMount(() => {
        void loadRoutines();
    });

    function normalizeRoutineDate(routine: Routine): Routine {
        return {
            ...routine,
            createdAt: new Date(routine.createdAt)
        };
    }

    function buildDefaultRoutineName(): string {
        const nextIndex = routines.length + 1;
        return `Routine ${nextIndex}`;
    }

    function buildRoutineDraft(routine: Routine): RoutineDraft {
        const invokeType = routine.invokeTime.type;
        return {
            name: routine.name,
            invokeType,
            hours: String(routine.invokeTime.hours),
            days: invokeType === "days" || invokeType === "weeks" ? String(routine.invokeTime.days) : "1",
            weeks: invokeType === "weeks" ? String(routine.invokeTime.weeks) : "1",
            executeForMode: routine.executeFor === "all" ? "all" : "specific",
            executeForRaw: routine.executeFor === "all" ? "[]" : JSON.stringify(routine.executeFor, null, 2)
        };
    }

    function getRoutineDraft(routine: Routine): RoutineDraft {
        return draftByRoutineId[routine.routineId] ?? buildRoutineDraft(routine);
    }

    function setRoutineDraft(routineId: string, update: Partial<RoutineDraft>) {
        const targetRoutine = routines.find((candidate) => candidate.routineId === routineId);
        if (!targetRoutine) {
            return;
        }

        const currentDraft = getRoutineDraft(targetRoutine);
        draftByRoutineId = {
            ...draftByRoutineId,
            [routineId]: {
                ...currentDraft,
                ...update
            }
        };
    }

    function normalizeExecuteForForCompare(executeFor: ExecuteFor): string {
        if (executeFor === "all") {
            return "all";
        }

        return JSON.stringify(executeFor);
    }

    function hasUnsavedChanges(routine: Routine): boolean {
        const draft = getRoutineDraft(routine);
        const nextInvoke = buildInvokeTimeFromDraft(draft);
        const nextExecuteFor = parseExecuteForFromDraft(draft);

        if (!nextInvoke || !nextExecuteFor) {
            return true;
        }

        return (
            draft.name.trim() !== routine.name
            || JSON.stringify(nextInvoke) !== JSON.stringify(routine.invokeTime)
            || normalizeExecuteForForCompare(nextExecuteFor) !== normalizeExecuteForForCompare(routine.executeFor)
        );
    }

    function notifyInfo(name: string, description: string) {
        $alertState = {
            alert: {
                name,
                description,
                type: "info"
            },
            timeoutMs: 3_000
        };
    }

    function notifyWarning(name: string, description: string) {
        $alertState = {
            alert: {
                name,
                description,
                type: "warning"
            },
            timeoutMs: 3_000
        };
    }

    function notifyError(name: string, description: string) {
        $alertState = {
            alert: {
                name,
                description,
                type: "error"
            },
            timeoutMs: 4_000
        };
    }

    function isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === "object" && value !== null;
    }

    function isStringArray(value: unknown): value is string[] {
        return Array.isArray(value) && value.every((item) => typeof item === "string");
    }

    function isExecuteForValue(value: unknown): value is ExecuteFor {
        if (value === "all") {
            return true;
        }

        if (!Array.isArray(value)) {
            return false;
        }

        return value.every((entry) => {
            if (!isRecord(entry) || typeof entry.listId !== "string") {
                return false;
            }

            if (entry.pointsIds !== undefined && !isStringArray(entry.pointsIds)) {
                return false;
            }

            if (entry.errors !== undefined) {
                if (!Array.isArray(entry.errors)) {
                    return false;
                }

                if (
                    !entry.errors.every((error) =>
                        isRecord(error)
                        && typeof error.listId === "string"
                        && (error.pointsIds === undefined || isStringArray(error.pointsIds))
                        && (error.error === "list-does-not-exist" || error.error === "points-does-not-exists")
                    )
                ) {
                    return false;
                }
            }

            return true;
        });
    }

    function parseNonNegativeInteger(raw: string): number | undefined {
        const value = Number(raw);
        if (!Number.isInteger(value) || value < 0) {
            return undefined;
        }

        return value;
    }

    function buildInvokeTimeFromDraft(draft: RoutineDraft): Routine["invokeTime"] | undefined {
        const hours = parseNonNegativeInteger(draft.hours);
        if (hours === undefined) {
            return undefined;
        }

        if (draft.invokeType === "time") {
            return {
                type: "time",
                hours
            };
        }

        const days = parseNonNegativeInteger(draft.days);
        if (days === undefined) {
            return undefined;
        }

        if (draft.invokeType === "days") {
            return {
                type: "days",
                days,
                hours
            };
        }

        const weeks = parseNonNegativeInteger(draft.weeks);
        if (weeks === undefined) {
            return undefined;
        }

        return {
            type: "weeks",
            weeks,
            days,
            hours
        };
    }

    function parseExecuteForFromDraft(draft: RoutineDraft): ExecuteFor | undefined {
        if (draft.executeForMode === "all") {
            return "all";
        }

        const raw = draft.executeForRaw.trim();
        if (!raw) {
            return undefined;
        }

        try {
            const parsed = JSON.parse(raw);
            if (!isExecuteForValue(parsed) || parsed === "all") {
                return undefined;
            }

            return parsed;
        }
        catch {
            return undefined;
        }
    }

    function getExecuteForSummary(executeFor: ExecuteFor): string {
        if (executeFor === "all") {
            return "All lists and points";
        }

        if (executeFor.length === 0) {
            return "Specific mode (no lists selected yet)";
        }

        return `Specific mode (${executeFor.length} list target${executeFor.length > 1 ? "s" : ""})`;
    }

    function canSwitchEditTarget(nextRoutineId: string): boolean {
        if (!editionRoutineId || editionRoutineId === nextRoutineId) {
            return true;
        }

        const currentRoutine = routines.find((routine) => routine.routineId === editionRoutineId);
        if (!currentRoutine || !hasUnsavedChanges(currentRoutine)) {
            return true;
        }

        return confirm("You have unsaved changes on another routine. Discard them and continue?");
    }

    function onClose() {
        open = false;
    }

    function resolveCodeMirrorPayload(payload: unknown): string {
        if (typeof payload === "string") {
            return payload;
        }

        if (payload && typeof payload === "object") {
            const valuePayload = payload as { value?: unknown; detail?: { value?: unknown } };
            const value = valuePayload.value ?? valuePayload.detail?.value;
            if (typeof value === "string") {
                return value;
            }
        }

        return String(payload ?? "");
    }

    function getRoutineRequestContext() {
        const workspaceId = $selectedWorkspace?.id ?? "test-workspace";
        const fileId = $selectedFile?.id ?? "test-file";
        const mode = $selectedTab.toLocaleLowerCase();
        return { workspaceId, fileId, mode };
    }

    async function loadRoutines() {
        const requestId = ++loadRequestId;
        loadingRoutines = true;
        loadError = null;

        try {
            const downloaded = await downloadRoutinesConfig();
            if (requestId !== loadRequestId) {
                return;
            }

            routines = downloaded.map((routine) => normalizeRoutineDate(routine));
            editionRoutineId = undefined;
            draftByRoutineId = {};
            newRoutineId = undefined;
        }
        catch {
            if (requestId !== loadRequestId) {
                return;
            }

            // loadError = "Cannot load routines";
            routines = [];
        }
        finally {
            if (requestId === loadRequestId) {
                loadingRoutines = false;
            }
        }
    }

    async function downloadRoutinesConfig(): Promise<Routine[]> {
        const { workspaceId, fileId, mode } = getRoutineRequestContext();

        try {
            const response = await fetchAuthenticated(`${PUBLIC_SOCKET_IO_PLAY_CONNECTION_URL}/routines-spikes/${mode}/download-config`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    workspaceId,
                    fileId,
                    configType: "routines"
                })
            });

            if (response.ok) {
                const configRoutines = await response.json() as Routine[];
                return configRoutines;
            }

            throw new Error("Failed to download routines config");
        }
        catch(err) {
            console.error("Cannot download Routines config", err);
            throw err;
        }
    }

    async function createRoutineConfig(routine: Routine): Promise<Routine> {
        const { workspaceId, fileId, mode } = getRoutineRequestContext();

        const response = await fetchAuthenticated(`${PUBLIC_SOCKET_IO_PLAY_CONNECTION_URL}/routines-spikes/${mode}/create-config`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                workspaceId,
                fileId,
                creation: routine
            })
        });

        if (!response.ok) {
            throw new Error("Cannot create routine");
        }

        return normalizeRoutineDate(routine);
    }

    async function updateRoutineConfig(routine: Routine): Promise<Routine> {
        const { workspaceId, fileId, mode } = getRoutineRequestContext();

        const response = await fetchAuthenticated(`${PUBLIC_SOCKET_IO_PLAY_CONNECTION_URL}/routines-spikes/${mode}/update-config`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                workspaceId,
                fileId,
                targetId: routine.routineId,
                updation: routine
            })
        });

        if (!response.ok) {
            throw new Error("Cannot update routine");
        }

        return normalizeRoutineDate(routine);
    }

    async function deleteRoutineConfig(routineId: string): Promise<void> {
        const { workspaceId, fileId, mode } = getRoutineRequestContext();

        const response = await fetchAuthenticated(`${PUBLIC_SOCKET_IO_PLAY_CONNECTION_URL}/routines-spikes/${mode}/delete-config`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                workspaceId,
                fileId,
                targetId: routineId
            })
        });

        if (!response.ok) {
            throw new Error("Cannot delete routine");
        }
    }

    function onCreateRoutine() {
        if (!canSwitchEditTarget("")) {
            return;
        }

        const workspaceId = $selectedWorkspace?.id ?? "workspace";
        const fileId = $selectedFile?.id ?? "file";
        const routineId = crypto.randomUUID();

        const createdRoutine: Routine = {
            workspaceId,
            fileId,
            routineId,
            invokeTime: {
                type: "time",
                hours: 1
            },
            name: buildDefaultRoutineName(),
            executeFor: "all",
            createdAt: new Date(),
            createdByAuthorId: $userProfile?.id ?? "anonymous-user"
        };

        routines = [createdRoutine, ...routines];
        draftByRoutineId = {
            ...draftByRoutineId,
            [routineId]: buildRoutineDraft(createdRoutine)
        };

        newRoutineId = routineId;
        editionRoutineId = routineId;
        notifyInfo("Routine created", "Configure the routine and save it.");
    }

    function onStartEditRoutine(routine: Routine) {
        return () => {
            if (routine.routineId === editionRoutineId) {
                if (hasUnsavedChanges(routine)) {
                    const discard = confirm("Discard unsaved changes for this routine?");
                    if (!discard) {
                        return;
                    }
                }

                editionRoutineId = undefined;
                return;
            }

            if (!canSwitchEditTarget(routine.routineId)) {
                return;
            }

            editionRoutineId = routine.routineId;
            draftByRoutineId = {
                ...draftByRoutineId,
                [routine.routineId]: getRoutineDraft(routine)
            };
        };
    }

    function onChangeInvokeType(routineId: string, invokeType: RoutineDraft["invokeType"]) {
        const fallbackUpdate = invokeType === "weeks"
            ? { days: "1", weeks: "1" }
            : invokeType === "days"
                ? { days: "1" }
                : {};

        setRoutineDraft(routineId, {
            invokeType,
            ...fallbackUpdate
        });
    }

    function onExecuteForCodeChange(routineId: string, payload: unknown) {
        setRoutineDraft(routineId, {
            executeForRaw: resolveCodeMirrorPayload(payload)
        });
    }

    function onCancelEdition(routine: Routine) {
        return () => {
            if (hasUnsavedChanges(routine)) {
                const discard = confirm("You have unsaved changes. Leave editing and discard them?");
                if (!discard) {
                    return;
                }
            }

            draftByRoutineId = {
                ...draftByRoutineId,
                [routine.routineId]: buildRoutineDraft(routine)
            };

            if (newRoutineId === routine.routineId) {
                routines = routines.filter((candidate) => candidate.routineId !== routine.routineId);

                const { [routine.routineId]: removedDraft, ...remainingDrafts } = draftByRoutineId;
                void removedDraft;
                draftByRoutineId = remainingDrafts;
                newRoutineId = undefined;
            }

            editionRoutineId = undefined;
        };
    }

    function onSaveEdition(routine: Routine) {
        return async () => {
            const draft = getRoutineDraft(routine);
            const nextName = draft.name.trim();
            if (!nextName) {
                notifyWarning("Routine name required", "Enter a routine name before saving.");
                return;
            }

            const nextInvokeTime = buildInvokeTimeFromDraft(draft);
            if (!nextInvokeTime) {
                notifyWarning("Invoke time is invalid", "Fill invoke time fields with non-negative integers.");
                return;
            }

            const nextExecuteFor = parseExecuteForFromDraft(draft) ?? "all";
            if (!nextExecuteFor) {
                notifyWarning("ExecuteFor is invalid", "Use 'all' or valid JSON array for specific targets.");
                return;
            }

            const updatedRoutine: Routine = {
                ...routine,
                name: nextName,
                invokeTime: nextInvokeTime,
                executeFor: nextExecuteFor
            };

            try {
                const savedRoutine = newRoutineId === routine.routineId
                    ? await createRoutineConfig(updatedRoutine)
                    : await updateRoutineConfig(updatedRoutine);

                routines = routines.map((candidate) => {
                    if (candidate.routineId !== routine.routineId) {
                        return candidate;
                    }

                    return savedRoutine;
                });

                draftByRoutineId = {
                    ...draftByRoutineId,
                    [routine.routineId]: buildRoutineDraft(savedRoutine)
                };

                if (newRoutineId === routine.routineId) {
                    newRoutineId = undefined;
                }

                editionRoutineId = undefined;
                notifyInfo("Routine saved", "Routine configuration was sent to backend and saved.");
            }
            catch {
                notifyError("Save failed", "Backend rejected the routine save request.");
            }
        };
    }

    function onDeleteRoutine(routine: Routine) {
        return async () => {
            const confirmed = confirm(`Delete routine "${routine.name}"?`);
            if (!confirmed) {
                return;
            }

            if (newRoutineId !== routine.routineId) {
                try {
                    await deleteRoutineConfig(routine.routineId);
                }
                catch {
                    notifyError("Delete failed", "Backend rejected the routine deletion request.");
                    return;
                }
            }

            routines = routines.filter((candidate) => candidate.routineId !== routine.routineId);

            const { [routine.routineId]: removedDraft, ...remainingDrafts } = draftByRoutineId;
            void removedDraft;
            draftByRoutineId = remainingDrafts;

            if (editionRoutineId === routine.routineId) {
                editionRoutineId = undefined;
            }

            if (newRoutineId === routine.routineId) {
                newRoutineId = undefined;
            }

            notifyInfo("Routine deleted", "Routine was removed successfully.");
        };
    }

    function onCopyRoutineId(routine: Routine) {
        return async () => {
            await navigator.clipboard.writeText(routine.routineId);
            notifyInfo("Routine ID copied", "Routine ID has been copied.");
        };
    }

    function onNameInput(routineId: string, value: string) {
        setRoutineDraft(routineId, {
            name: value
        });
    }

    function onFieldInput(routineId: string, field: "hours" | "days" | "weeks", value: string) {
        setRoutineDraft(routineId, {
            [field]: value
        });
    }

    function formatInvokeTime(invokeTime: Routine["invokeTime"]): string {
        if (invokeTime.type === "time") {
            return `Every ${invokeTime.hours} hour(s)`;
        }

        if (invokeTime.type === "days") {
            return `Every ${invokeTime.days} day(s), +${invokeTime.hours} hour(s)`;
        }

        return `Every ${invokeTime.weeks} week(s), ${invokeTime.days} day(s), +${invokeTime.hours} hour(s)`;
    }
</script>

{#snippet RoutineCard(routine: Routine)}
    {@const draft = getRoutineDraft(routine)}
    {@const routineInEdit = routine.routineId === editionRoutineId}
    <div
        class="flex flex-col gap-4 p-3 rounded-lg border border-base-300 bg-base-200 {routineInEdit ? 'scale-[1.01] shadow-lg border-primary theme-dark:shadow-white/20' : ''}"
        id="routineCard"
        data-routine-id={routine.routineId}
    >
        <div class="name-author-date">
            <div class="flex gap-2 justify-between items-center">
                {#if routineInEdit}
                    <input
                        class="input input-sm bg-transparent border-none outline-none text-lg font-semibold px-0 w-3/4"
                        value={draft.name}
                        placeholder="Routine Name"
                        oninput={(event) => {
                            onNameInput(routine.routineId, (event.currentTarget as HTMLInputElement).value);
                        }}
                    />
                {:else}
                    <p class="font-semibold text-lg">{routine.name}</p>
                {/if}

                {#if !routineInEdit}
                    <button
                        class="btn btn-xs btn-ghost"
                        onclick={onStartEditRoutine(routine)}
                        title="Edit Routine"
                    >
                        <Icon icon="material-symbols:edit" />
                    </button>
                {:else}
                    <button
                        class="btn btn-xs btn-ghost"
                        onclick={onCancelEdition(routine)}
                        title="Stop editing"
                        aria-label="Stop editing"
                    >
                        <Icon icon="material-symbols:close-rounded" />
                    </button>
                {/if}
            </div>

            <p class="text-gray-400 text-sm">
                Created on <span class="font-semibold">{routine.createdAt.toLocaleDateString()}</span>
            </p>
        </div>

        <div class="flex flex-col gap-3">
            <div>
                <p class="font-semibold text-[15px] text-black">Invoke Time</p>
                <p class="text-sm text-gray-500">Choose when this routine should run.</p>
            </div>

            {#if routineInEdit}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <label class="form-control w-full">
                        <span class="label-text text-xs mb-1">Type</span>
                        <select
                            class="select select-sm select-bordered"
                            value={draft.invokeType}
                            onchange={(event) => {
                                onChangeInvokeType(
                                    routine.routineId,
                                    (event.currentTarget as HTMLSelectElement).value as RoutineDraft["invokeType"]
                                );
                            }}
                        >
                            <option value="time">hours</option>
                            <option value="days">days</option>
                            <option value="weeks">weeks</option>
                        </select>
                    </label>

                    {#if draft.invokeType === "weeks"}
                        <label class="form-control w-full">
                            <span class="label-text text-xs mb-1">Weeks</span>
                            <input
                                class="input input-sm input-bordered"
                                type="number"
                                min="0"
                                value={draft.weeks}
                                oninput={(event) => {
                                    onFieldInput(routine.routineId, "weeks", (event.currentTarget as HTMLInputElement).value);
                                }}
                            />
                        </label>
                    {/if}

                    {#if draft.invokeType === "days" || draft.invokeType === "weeks"}
                        <label class="form-control w-full">
                            <span class="label-text text-xs mb-1">Days</span>
                            <input
                                class="input input-sm input-bordered"
                                type="number"
                                min="0"
                                value={draft.days}
                                oninput={(event) => {
                                    onFieldInput(routine.routineId, "days", (event.currentTarget as HTMLInputElement).value);
                                }}
                            />
                        </label>
                    {/if}
                    
                    <label class="form-control w-full">
                        <span class="label-text text-xs mb-1">Hours</span>
                        <input
                            class="input input-sm input-bordered"
                            type="number"
                            min="0"
                            value={draft.hours}
                            oninput={(event) => {
                                onFieldInput(routine.routineId, "hours", (event.currentTarget as HTMLInputElement).value);
                            }}
                        />
                    </label>
                </div>
            {:else}
                <p class="text-sm text-base-content/80">{formatInvokeTime(routine.invokeTime)}</p>
            {/if}
        </div>

        <!-- <div id="executeFor" class="flex flex-col gap-2">
            <div>
                <p class="font-semibold text-[15px] text-black">Execute For</p>
                <p class="text-sm text-gray-500">Choose whether to execute for all points or specific targets.</p>
            </div>

            {#if routineInEdit}
                <label class="form-control w-full max-w-xs">
                    <span class="label-text text-xs mb-1">Mode</span>
                    <select
                        class="select select-sm select-bordered"
                        value={draft.executeForMode}
                        onchange={(event) => {
                            onExecuteForModeChange(
                                routine.routineId,
                                (event.currentTarget as HTMLSelectElement).value as RoutineDraft["executeForMode"]
                            );
                        }}
                    >
                        <option value="all">all</option>
                        <option value="specific">specific</option>
                    </select>
                </label>

                {#if draft.executeForMode === "specific"}
                    <CodeMirror
                        class="code-mirror-of-code-snippet"
                        value={draft.executeForRaw || "[]"}
                        editable={true}
                        lang={json()}
                        theme={$theme === "dark" ? oneDark : undefined}
                        onchange={(value) => onExecuteForCodeChange(routine.routineId, value)}
                        styles={{
                            "&": {
                                fontSize: "14px",
                                lineHeight: "1.5"
                            }
                        }}
                    />

                    <p class="text-[11px]">* JSON array of {`{ listId, pointsIds? }`} entries</p>
                {/if}
            {:else}
                <p class="text-sm text-base-content/80">{getExecuteForSummary(routine.executeFor)}</p>
            {/if}
        </div> -->

        <div class="flex gap-5 items-center justify-between border-t border-gray-200 pt-4 mt-2">
            <div class="flex gap-3 items-center">
                <button class="btn btn-sm btn-outline" onclick={onCopyRoutineId(routine)}>
                    Copy Routine ID
                </button>

                <button class="btn btn-sm btn-error" onclick={onDeleteRoutine(routine)}>
                    Delete Routine
                </button>
            </div>

            {#if routineInEdit && hasUnsavedChanges(routine)}
                <div class="flex gap-2 items-center">
                    <button class="btn btn-sm btn-success" onclick={onSaveEdition(routine)}>
                        Save
                    </button>
                </div>
            {/if}
        </div>
    </div>
{/snippet}

<ModalScreen bind:open>
    <UI.Modals.ModalWrapper
        name="Routines Config"
        bind:open
        closeOnBackdrop={true}
        size={{ custom: "max-w-1/2" }}
        on:close={onClose}
    >
        <UI.Modals.ModalWrapperHeading
            headingName="Routines Config"
            description="Create, edit and remove recurring routines"
            on:close={onClose}
        />

        <div class="max-h-[80vh] p-4 overflow-y-auto pr-1 flex flex-col">
            {#if loadingRoutines}
                <div class="loading">
                    <span class="loading-spinner loading-sm"></span>
                    <span>Loading Routines...</span>
                </div>
            {:else if loadError}
                <div class="flex items-center justify-center w-full h-full">
                    <p class="text-error">{loadError}</p>
                </div>
            {:else}
                <button
                    id="new-routine-btn"
                    class="btn btn-sm btn-outline theme-dark:border-white theme-dark:text-white btn-primary w-fit flex gap-2"
                    onclick={onCreateRoutine}
                >
                    <Icon icon="material-symbols:schedule-rounded" />
                    New Invoke-Time
                </button>

                <div class="routine-list mt-5 flex flex-col gap-7 overflow-auto p-2">
                    {#if routines.length}
                        {#each routines as routine (routine.routineId)}
                            {@render RoutineCard(routine)}
                        {/each}
                    {:else}
                        <div class="rounded-lg border border-dashed border-base-300 p-5 text-sm text-base-content/70">
                            No routines configured yet. Create your first routine.
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    </UI.Modals.ModalWrapper>
</ModalScreen>

<style>
    .routine-list {
        scrollbar-width: none;
        -ms-overflow-style: none;
    }

    .routine-list::-webkit-scrollbar {
        display: none;
    }
</style>