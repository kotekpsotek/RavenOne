import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function resolveHoistedModuleEntry(rootDir: string, packageName: string, entryPath: string): string {
	let searchDir = rootDir;

	while (true) {
		const candidate = path.resolve(searchDir, 'node_modules', packageName, entryPath);

		if (existsSync(candidate)) {
			return candidate;
		}

		const parentDir = path.dirname(searchDir);

		if (parentDir === searchDir) {
			throw new Error(`Unable to resolve ${packageName}/${entryPath} from ${rootDir}`);
		}

		searchDir = parentDir;
	}
}

export default defineConfig(({ mode }) => {
	const rootDir = fileURLToPath(new URL('.', import.meta.url));
	const svelteTiptapEntry = resolveHoistedModuleEntry(rootDir, 'svelte-tiptap', 'dist/index.js');
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
				'svelte-tiptap': svelteTiptapEntry
			}
		},
		ssr: {
			noExternal: ['svelte-codemirror-editor']
		}
	};
});
