import { webhookCallback } from 'grammy';
import type { RequestHandler } from './$types';
import { getBot } from '$lib/bot/index.js';

export const POST: RequestHandler = async (event) => {
	const bot = getBot();
	if (!bot) {
		return new Response('Bot not configured', { status: 503 });
	}

	const handler = webhookCallback(bot, 'sveltekit');
	return handler(event);
};

export const GET: RequestHandler = async () => {
	return new Response('Sift Telegram Webhook Endpoint is Active.', { status: 200 });
};
