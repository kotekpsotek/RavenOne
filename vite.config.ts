import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
	const rootDir = fileURLToPath(new URL('.', import.meta.url));
	const nodeModulesDir = path.resolve(rootDir, 'node_modules');
	const loadedEnv = loadEnv(mode, process.cwd(), '');

	for (const [key, value] of Object.entries(loadedEnv)) {
		if (process.env[key] === undefined) {
			process.env[key] = value;
		}
	}

	return {
		plugins: [tailwindcss(), sveltekit()],
		resolve: {
			preserveSymlinks: true,
			dedupe: [
				'codemirror',
				'@codemirror/state',
				'@codemirror/view',
				'@codemirror/language',
				'@codemirror/autocomplete'
			],
			alias: {
				'svelte-tiptap': path.resolve(nodeModulesDir, 'svelte-tiptap/dist/index.js')
			}
		},
		ssr: {
			noExternal: ['svelte-codemirror-editor']
		}
	};
});
