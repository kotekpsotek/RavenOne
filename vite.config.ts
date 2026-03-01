// @ts-nocheck
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { setupPlaySocketServer } from '$lib/server/socket.io-server';

export default defineConfig({
	plugins: [
		{
			name: 'play-socket-server',
			configureServer(server) {
				setupPlaySocketServer(server);
			}
		},
		tailwindcss(),
		sveltekit()
	],
	ssr: {
		noExternal: ['svelte-codemirror-editor']
	}
});
