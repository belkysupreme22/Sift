import type { Handle } from '@sveltejs/kit';
import { startBot } from '$lib/bot/index.js';
import type { Bot } from 'grammy';

declare global {
	var __sift_bot_instance: Bot | null | undefined;
	var __sift_bot_starting: boolean | undefined;
}

// Function to safely start or hot-reload the bot during development
async function bootBot() {
	if (globalThis.__sift_bot_starting || globalThis.__sift_bot_instance) return;
	globalThis.__sift_bot_starting = true;

	try {
		console.log('[Server Hook] Starting grammY bot...');
		const bot = startBot();
		if (bot) {
			globalThis.__sift_bot_instance = bot;
		}
	} catch (err) {
		console.error('[Server Hook] Error booting bot:', err);
	} finally {
		globalThis.__sift_bot_starting = false;
	}
}

// Boot once on server initialization
bootBot();

export const handle: Handle = async ({ event, resolve }) => {
	if (!globalThis.__sift_bot_instance && !globalThis.__sift_bot_starting) {
		bootBot();
	}
	const response = await resolve(event);
	return response;
};
