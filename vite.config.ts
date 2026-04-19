import { sveltekit } from '@sveltejs/kit/vite';
import { loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { existsSync } from 'node:fs';
import path from 'node:path';

function resolveHoistedPackageFile(packageName: string, relativeFile: string) {
	let currentDir = process.cwd();

	while (true) {
		const candidate = path.join(currentDir, 'node_modules', packageName, relativeFile);

		if (existsSync(candidate)) {
			return candidate;
		}

		const parentDir = path.dirname(currentDir);

		if (parentDir === currentDir) {
			throw new Error(`Unable to resolve ${packageName}/${relativeFile} from ${process.cwd()}`);
		}

		currentDir = parentDir;
	}
}

export default ({ mode }: { mode: string }) => {
	const loadedEnv = loadEnv(mode, process.cwd(), '');

	for (const [key, value] of Object.entries(loadedEnv)) {
		if (process.env[key] === undefined) {
			process.env[key] = value;
		}
	}

	return {
		plugins: [tailwindcss(), sveltekit()],
		optimizeDeps: {
			include: ['@tiptap/extension-youtube']
		},
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
				'svelte-tiptap': resolveHoistedPackageFile('svelte-tiptap', 'dist/index.js')
			}
		},
		ssr: {
			noExternal: ['svelte-codemirror-editor']
		}
	};
};
