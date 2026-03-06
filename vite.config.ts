import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
	const loadedEnv = loadEnv(mode, process.cwd(), '');

	for (const [key, value] of Object.entries(loadedEnv)) {
		if (process.env[key] === undefined) {
			process.env[key] = value;
		}
	}

	return {
		plugins: [tailwindcss(), sveltekit()],
		ssr: {
			noExternal: ['svelte-codemirror-editor']
		}
	};
});
