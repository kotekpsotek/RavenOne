import {
    asNonEmptyString,
    loadWorkspaceEntries,
    parseJsonBody,
    persistWorkspaceEntries,
    requireWorkspaceAccess,
    updateFileById
} from "../../server-utils";
import { File, AI } from "@ravenlens/shared";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

type SaveModelRequestBody = {
    workspaceId?: unknown;
    fileId?: unknown;
    tab?: unknown;
    model?: unknown;
};

type TabsAvailable = "Tasks" | "Routines" | "Spikes";
type ConfigTarget = keyof Pick<File.File.File, "lists" | "routines" | "spikes">;

function getConfigTargetByTab(tab: TabsAvailable): ConfigTarget {
    if (tab === "Routines") {
        return "routines";
    }

    if (tab === "Spikes") {
        return "spikes";
    }

    return "lists";
}

function asTab(value: unknown): TabsAvailable | undefined {
    if (value === "Tasks" || value === "Routines" || value === "Spikes") {
        return value;
    }

    return undefined;
}

function normalizeProvider(value: unknown): AI.ProviderID | { provider: string } {
    if (value === "OpenAI" || value === "Google" || value === "Anthropic") {
        return value;
    }

    if (value && typeof value === "object") {
        const providerFromObject = asNonEmptyString((value as { provider?: unknown }).provider);
        if (providerFromObject) {
            return { provider: providerFromObject };
        }
    }

    const providerFromString = asNonEmptyString(value);
    if (providerFromString) {
        return { provider: providerFromString };
    }

    return { provider: "" };
}

function normalizeModel(value: unknown): File.FileAI.UsedAIModel | undefined {
    if (!value || typeof value !== "object") {
        return undefined;
    }

    const modelValue = value as {
        id?: unknown;
        name?: unknown;
        provider?: unknown;
        weight?: unknown;
    };

    const id = asNonEmptyString(modelValue.id) ?? "";
    const name = asNonEmptyString(modelValue.name) ?? "";

    if (!id && !name) {
        return undefined;
    }

    const weightCandidate = typeof modelValue.weight === "number" ? modelValue.weight : 1;
    const weight = Number.isFinite(weightCandidate) ? weightCandidate : 1;

    return {
        id,
        name,
        provider: normalizeProvider(modelValue.provider),
        weight
    };
}

function createDefaultSpawnedListConfig(): File.File.SpawnedList {
    return {
        list: [],
        config: {
            model: {
                id: "",
                name: "",
                provider: {
                    provider: ""
                },
                weight: 0
            },
            context: {
                desktopFiles: [],
                editorFiles: [],
                networkUrls: []
            }
        }
    };
}

function normalizeSpawnedList(value: unknown): File.File.SpawnedList {
    if (!value || typeof value !== "object") {
        return createDefaultSpawnedListConfig();
    }

    const spawnedList = value as Partial<File.File.SpawnedList>;
    const config = (spawnedList.config ?? {}) as Partial<File.File.SpawnedList["config"]>;

    return {
        list: Array.isArray(spawnedList.list) ? spawnedList.list : [],
        config: {
            model: {
                ...createDefaultSpawnedListConfig().config.model,
                ...(config.model ?? {})
            },
            context: {
                desktopFiles: [...(config.context?.desktopFiles ?? [])],
                editorFiles: [...(config.context?.editorFiles ?? [])],
                networkUrls: [...(config.context?.networkUrls ?? [])]
            }
        }
    };
}

export const POST: RequestHandler = async ({ request, cookies, fetch }) => {
    const requestBody = await parseJsonBody<SaveModelRequestBody>(request);
    if (!requestBody) {
        return json({ ok: false, message: "Invalid request body" }, { status: 400 });
    }

    const workspaceId = asNonEmptyString(requestBody.workspaceId);
    const fileId = asNonEmptyString(requestBody.fileId);
    const tab = asTab(requestBody.tab);
    const model = normalizeModel(requestBody.model);

    if (!workspaceId || !fileId || !tab || !model) {
        return json(
            { ok: false, message: "workspaceId, fileId, tab and model are required" },
            { status: 400 }
        );
    }

    const access = await requireWorkspaceAccess({
        request,
        cookies,
        fetchFn: fetch,
        workspaceId,
        requireActiveWorkspaceSubscription: true,
        activeWorkspaceSubscriptionFailureMessage: "Cannot update model because this workspace has no active subscription"
    });

    if (access instanceof Response) {
        return access;
    }

    try {
        const workspaceEntries = await loadWorkspaceEntries(workspaceId);
        const target = getConfigTargetByTab(tab);

        const updateResult = updateFileById(workspaceEntries, fileId, (entry) => {
            const targetData = normalizeSpawnedList(entry[target]);

            return {
                ...entry,
                [target]: {
                    ...targetData,
                    config: {
                        ...targetData.config,
                        model
                    }
                }
            };
        });

        if (!updateResult.updated) {
            return json({ ok: false, message: "File not found" }, { status: 404 });
        }

        await persistWorkspaceEntries(workspaceId, updateResult.entries);

        return json(
            {
                ok: true,
                fileId,
                tab,
                model
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("Cannot persist selected tab model", error);
        return json({ ok: false, message: "Cannot persist selected tab model" }, { status: 500 });
    }
};
