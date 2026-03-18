import type { SubscriptionKinds } from "@ravenlens/shared";
import { fetchAuthenticated } from "$lib/utils/fetch";

type WorkspaceSubscriptionCheckResponse = {
	status?: boolean;
	subscriptionKind?: unknown;
};

function asSubscriptionKind(value: unknown): SubscriptionKinds | undefined {
	if (value === "starter" || value === "growth" || value === "enterprise") {
		return value;
	}

	return undefined;
}

/**
 * Checks is user workspace owner a owner of subscription and returns plan name
 * @returns undefined or false - when the method doesn't exist
 */
export async function getWorkspaceActiveSubscription(workspaceId: string): Promise<SubscriptionKinds | undefined | false> {
	const normalizedWorkspaceId = workspaceId.trim();
	if (!normalizedWorkspaceId.length) {
		return undefined;
	}

	let response: Response;
	try {
		response = await fetchAuthenticated("/subscription/check", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({ workspaceId: normalizedWorkspaceId })
		});
	} catch {
		return undefined;
	}

	// Backward compatibility: older deployments might not have this endpoint.
	if (response.status === 404 || response.status === 405) {
		return false;
	}

	if (!response.ok) {
		return undefined;
	}

	try {
		const responseBody = await response.json() as WorkspaceSubscriptionCheckResponse;
		return asSubscriptionKind(responseBody.subscriptionKind);
	} catch {
		return undefined;
	}
}