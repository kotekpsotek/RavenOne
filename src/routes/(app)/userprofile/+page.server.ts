import type { ProfilePageLoadData } from "@ravenlens/shared";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
    return {
        profile: {
            id: "",
            name: "xxxx",
            mainAccountType: "email",
            linkedAccounts: [],
            createdAt: new Date()
        },
        subscription: {
            userId: "",
            status: "none",
            initializedOn: new Date(),
            renewsOn: new Date(),
            plan: {
                planId: "",
                kind: "individual",
                name: "",
                price: 0,
                currency: { currency: "USD" },
                period: {
                    from: new Date(),
                    to: new Date()
                },
                features: [],
                subscriptionPowerAndType: {
                    type: "individual",
                    maxWorkspaces: 1
                }
            }
        }
    } satisfies ProfilePageLoadData;
}
