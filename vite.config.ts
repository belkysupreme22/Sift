import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		{
			name: 'auto-boot-bot',
			configureServer(server) {
				// Immediately load hooks.server.ts on Vite start so the Telegram bot starts without waiting for a browser request
				setTimeout(() => {
					server.ssrLoadModule('/src/hooks.server.ts').catch((err) => {
						console.error('[Vite] Error booting bot in hooks:', err);
					});
				}, 100);
			}
		}
	],
	server: {
		host: '0.0.0.0'
	}
});
