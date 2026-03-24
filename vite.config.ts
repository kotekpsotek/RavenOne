import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig(({ mode }) => {
	const loadedEnv = loadEnv(mode, process.cwd(), '');

	for (const [key, value] of Object.entries(loadedEnv)) {
		if (process.env[key] === undefined) {
			process.env[key] = value;
		}
	}

	return {
		plugins: [tailwindcss(), sveltekit()],
		resolve: {
			dedupe: [
				'codemirror',
				'svelte-codemirror-editor',
				'@codemirror/state',
				'@codemirror/view',
				'@codemirror/language',
				'@codemirror/autocomplete',
				'@codemirror/commands',
				'@codemirror/lint',
				'@codemirror/search'
			],
			alias: {
				'svelte-tiptap': path.resolve(process.cwd(), 'node_modules/svelte-tiptap'),
				'@buddhima_a/tiptap-diff-suggestions': path.resolve(
					process.cwd(),
					'../../node_modules/@buddhima_a/tiptap-diff-suggestions/dist/index.esm.js'
				),
			}
		},
		ssr: {
			noExternal: ['svelte-codemirror-editor']
		}
	};
});
