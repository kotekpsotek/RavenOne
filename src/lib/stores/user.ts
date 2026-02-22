import { writable } from "svelte/store";

export interface User {
    id: string;
    name: string;
    email: string;
    profileImgURL: string;
}

export const user = writable<User | undefined>({
    id: 'current-user',
    name: 'Vioz Isildur',
    email: 'admin@viozisildur.com',
    profileImgURL: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=1974&auto=format&fit=crop'
});
