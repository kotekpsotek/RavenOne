import { writable } from "svelte/store";
import type { Profile } from "@ravenlens/shared";

export interface User {
    id: string;
    name: string;
    email: string;
    profileImgURL: string;
}

/** This is downloaded convinient version - light for database operations and network bandwith */
export const user = writable<User | undefined>({
    id: 'current-user',
    name: 'Vioz Isildur',
    email: 'admin@viozisildur.com',
    profileImgURL: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=1974&auto=format&fit=crop'
});

/** This is downloaded full user profile */
export const userProfile = (() => {
    const { ...all } = writable<Profile | undefined>(undefined);

    return {
        ...all,
        async download() {
            // TODO: Download real user profile from database
            // Simulate profile downloading and sets the profile
            return new Promise<Profile>(res => {
                setTimeout(() => {
                    const profile: Profile = {
                        id: 'current-user',
                        name: 'Vioz Isildur',
                        email: 'admin@viozisildur.com',
                        profileImgURL: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=1974&auto=format&fit=crop',
                        mainAccountType: 'email',
                        linkedAccounts: ['email'],
                        createdAt: new Date()
                    };

                    all.set(profile);
                    res(profile);
                }, 7_500)
            });
        }
    }
})();

