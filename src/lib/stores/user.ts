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

