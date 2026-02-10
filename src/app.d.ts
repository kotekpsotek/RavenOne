// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

declare module '*.svelte' {
	import { ComponentType, SvelteComponent } from 'svelte';
	const component: ComponentType<SvelteComponent> | any;
	export default component;
}

export {};
