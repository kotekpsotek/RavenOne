import { get, writable } from "svelte/store";
import type { Profile } from "@ravenlens/shared";

export interface User {
    id: string;
    name: string;
    email: string;
    profileImgURL: string;
}

/** This is downloaded full user profile */
export const userProfile = (() => {
    const { ...all } = writable<Profile | undefined>(undefined);

    return {
        ...all
    }
})();

export const waitTillProfileLoaded = (intervalMs: number = 500, MAX_WAIT_PERIOD_MS: number = 20_000) => {
    return new Promise<boolean>((res, rej) => {
        let waitForMs = 0;
        const timer = setInterval(() => {
            const profile = get(userProfile);

            if (profile) {
                clearInterval(timer);
                res(true);
            }

            // 
            waitForMs += intervalMs;
            
            // 
            if (waitForMs >= MAX_WAIT_PERIOD_MS) {
                rej(`Cannot download the user profile in specified ${MAX_WAIT_PERIOD_MS} treshold. Increaase Treshold or check network connection`)
            }
        }, intervalMs);
    })
};
