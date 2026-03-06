import { writable } from "svelte/store";

export type Themes = "dark" | "light";
export const theme = writable<Themes>("dark");

const THEME_STORAGE_KEY = "theme";
const DARK_DAISY_THEME = "black";

function isTheme(value: string | null): value is Themes {
	return value === "dark" || value === "light";
}

export function getStoredThemeMode(): Themes | null {
	if (typeof localStorage === "undefined") {
		return null;
	}

	const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
	return isTheme(storedTheme) ? storedTheme : null;
}

export function getDocumentThemeMode(): Themes {
	if (typeof document === "undefined") {
		return "light";
	}

	return document.documentElement.getAttribute("data-theme") === DARK_DAISY_THEME ? "dark" : "light";
}

function applyThemeToDocument(nextTheme: Themes) {
	if (typeof document === "undefined") {
		return;
	}

	const rootElement = document.documentElement;
	rootElement.setAttribute("data-theme", nextTheme === "dark" ? DARK_DAISY_THEME : "light");
	rootElement.classList.toggle("dark", nextTheme === "dark");
}

export function setThemeMode(nextTheme: Themes) {
	theme.set(nextTheme);
	applyThemeToDocument(nextTheme);

	if (typeof localStorage !== "undefined") {
		localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
	}

	return nextTheme;
}

export function syncThemeMode() {
	const nextTheme = getStoredThemeMode() ?? getDocumentThemeMode();
	return setThemeMode(nextTheme);
}

export function toggleThemeMode(currentTheme: Themes) {
	return setThemeMode(currentTheme === "dark" ? "light" : "dark");
}
