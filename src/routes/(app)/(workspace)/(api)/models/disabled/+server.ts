import { json, type RequestHandler } from "@sveltejs/kit";
import { downloadCurrentUser } from "$lib/utils/auth";
import { prefetchWorkspaceWithMembers } from "$lib/server/db";
import { extractBearerToken } from "$lib/server/auth/request";
import { avaiableModels, subscriptionAvaiableAIModels } from "$lib/config/models";
import { DB_Models } from "@ravenlens/backend";
import type { AI } from "@ravenlens/shared";
import { getUserActiveSubscription } from "$lib/server/subscription";
import type { DisabledModelsResponse } from "./disabled";

const providersOfAvaiableModels = Array.from(new Set(avaiableModels.map(aModel => aModel.provider)));

export const POST: RequestHandler = async ({ request, url }) => {
    const { workspaceId } = await request.json() as {
        workspaceId: string;
    };

    // 1. Check is user authenticated
    const jwt = extractBearerToken(request);
    if (!jwt) {
        return new Response(JSON.stringify({ message: "You're not authenticated" }), {
            status: 401
        })
    }

    const authenticationResponse = await downloadCurrentUser(jwt, url.origin);
    if (!authenticationResponse.status || !authenticationResponse.data) {
        return new Response(JSON.stringify({ message: "You're not authenticated member" }), {
            status: 401
        })
    }

    // Prefetch workspace user is poiniting to
    const userWorkspacesQuota = await prefetchWorkspaceWithMembers(workspaceId);
    if (!userWorkspacesQuota) {
        return new Response(JSON.stringify({ message: "Following workspace doesn't exist" }), {
            status: 404
        })
    }
    
    // Find member is this user within this workspace
    const thisUserAWorkspaceMember = userWorkspacesQuota.workspaceMembers.find(member => member.user.id === authenticationResponse.data?.user.id)
    
    // Check is user member of workspace with `workspaceId`
    if (!thisUserAWorkspaceMember) {
        return new Response(JSON.stringify({ message: "You're not workspace member" }), {
            status: 401
        })
    }

    const getAPIKeyNotAvaiableModels = async () => {
        // Download all workspace providers api keys
        const workspaceAPIKeys = await DB_Models.Workspace.APIKey.apiKeyModel.find({
            workspaceId: userWorkspacesQuota.id
        }).lean();
    
        // TODO: Makr only models are disabled as disabled
        if (!workspaceAPIKeys.length) {
            // Return all models as disabled
            return avaiableModels;
        }
    
        // TODO: Check whether each workspaceAPI Key is registered on OpenAI/ Anthropic side -> check whether is this possible to check
    
        // Get providers avaiablity object and list of not avaiable providers
        const [objProviders, notAvaiableProviders] = (() => {
            const objectEntries: [AI.ProviderID, boolean][] = [];
    
            for (const avaiableProvider of providersOfAvaiableModels) {
                const isProviderAvaiable = workspaceAPIKeys.some(apiKeyObj => apiKeyObj.provider === avaiableProvider);
                
                objectEntries.push([
                    avaiableProvider,
                    isProviderAvaiable
                ]);
            }
    
            const notAvaiableProvidersIDs = objectEntries.filter(([providerId, avaiability]) => {
                if (!avaiability) {
                    return true;
                }
    
                return false;
            }).map(([providerId, _]) => providerId);
    
            return [
                Object.fromEntries(objectEntries),
                notAvaiableProvidersIDs
            ];        
        })()
    
        // Gets list with models aren't avaiable
        const nonAviabaleStandaloneModels = avaiableModels.filter(model => notAvaiableProviders.includes(model.provider))

        //
        return nonAviabaleStandaloneModels;
    }

    /** Retrived models belong to subscriptions are higher than actual subscription */
    const getSubscriptionNotAvaiableModels = async () => {
        // 1. Download subscription of workspace owner
        const subscription = await getUserActiveSubscription(userWorkspacesQuota.ownerUserId);

        // 2. Get models avaiable for subscription
        const avaiableSubscriptionModels = subscriptionAvaiableAIModels[subscription.subscriptionKind!];
        const subscriptionModelNames = avaiableSubscriptionModels.map(subModel => subModel.model);

        // 3. Get All not avaiable in subscription models
        return avaiableModels.filter(aModel => !subscriptionModelNames.includes(aModel.model))
    }
    
    // Retrive not avaiable ai models
    const apiKeyAbsentModels = await getAPIKeyNotAvaiableModels();
    const subscriptionNotAvaiableModels = await getSubscriptionNotAvaiableModels();

    // Return list with avaiable ai models from `avaiableModels`
    return json({
        apiKeyAbsentModels: apiKeyAbsentModels,
        subscriptionNotAvaiableModels: subscriptionNotAvaiableModels,
        // Return not avaiable ai models list without sorting for uniqueness
        allNotAvaiableModels: Array.from(
            new Map(
                [...apiKeyAbsentModels, ...subscriptionNotAvaiableModels].map((m) => [m.model, m])
            ).values()
        )
    } satisfies DisabledModelsResponse, { status: 200 });
}
