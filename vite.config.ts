import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function resolvePackageEntry(rootDir: string, packageName: string, entryRelativePath: string): string {
	let currentDir = rootDir;

	while (true) {
		const candidate = path.resolve(currentDir, 'node_modules', packageName, entryRelativePath);
		if (fs.existsSync(candidate)) {
			return candidate;
		}

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			throw new Error(`Cannot resolve ${packageName}/${entryRelativePath} from ${rootDir}`);
		}

		currentDir = parentDir;
	}
}

export default defineConfig(({ mode }) => {
	const rootDir = fileURLToPath(new URL('.', import.meta.url));
	const loadedEnv = loadEnv(mode, process.cwd(), '');
	const svelteTiptapEntry = resolvePackageEntry(rootDir, 'svelte-tiptap', 'dist/index.js');

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
