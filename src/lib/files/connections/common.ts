import { setAlert } from "$lib/utils/alert";
import { fetchAuthenticated } from "$lib/utils/fetch";
import { readFailureMessage, type FilesApiRequestMethod } from "../utils";

export async function requestFilesApi<T>(
    path: string,
    method: FilesApiRequestMethod,
    payload: Record<string, unknown>,
    alertTitle: string,
    fallbackMessage: string
): Promise<T | null> {
    let response: Response;
    try {
        response = await fetchAuthenticated(path, {
            method,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
    } catch {
        setAlert("error", alertTitle, "Cannot reach files service.");
        return null;
    }

    if (!response.ok) {
        const body = await response.json();

        if (body.type === "collaboration_file") {
            const message = await readFailureMessage(response, fallbackMessage);
            setAlert("error", alertTitle, message);
        }
        
        return null;
    }

    try {
        return (await response.json()) as T;
    } catch {
        return {} as T;
    }
}
