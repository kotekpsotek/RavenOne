import { env } from "$env/dynamic/private";


export function getRequiredEnv(name: string): string {
    const value = (env as Record<string, string | undefined>)[name]?.trim();
    if (!value) {
        throw new Error(`${name} is not configured`);
    }

    return value;
}