import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as db from '$lib/db/index.js';
import { getBot, getCleanWebAppUrl } from '$lib/bot/index.js';

export const GET: RequestHandler = async () => {
	const health: {
		status: string;
		timestamp: string;
		database: { connected: boolean; sessionExists: boolean; channelCount?: number; storyCount?: number; error?: string };
		bot: { configured: boolean; botUser?: string; error?: string };
		env: { webappUrl: string; trackedChannels: string; hasTgApiId: boolean; hasTgApiHash: boolean; hasBotToken: boolean; hasDbUrl: boolean };
	} = {
		status: 'ok',
		timestamp: new Date().toISOString(),
		database: { connected: false, sessionExists: false },
		bot: { configured: false },
		env: {
			webappUrl: getCleanWebAppUrl(),
			trackedChannels: process.env.TRACKED_CHANNELS || process.env.CHANNELS_ALLOWLIST || 'All subscribed channels',
			hasTgApiId: Boolean(process.env.TG_API_ID),
			hasTgApiHash: Boolean(process.env.TG_API_HASH),
			hasBotToken: Boolean(process.env.BOT_TOKEN),
			hasDbUrl: Boolean(process.env.DATABASE_URL)
		}
	};

	// 1. Check Database connection & counts
	try {
		const session = await db.getSession();
		const channels = await db.getAllChannels();
		const dayCards = await db.getDayCards();
		health.database = {
			connected: true,
			sessionExists: Boolean(session?.sessionString),
			channelCount: channels.length,
			storyCount: dayCards.reduce((acc, card) => acc + (card.messages?.length || 0), 0)
		};
	} catch (dbErr: any) {
		health.database = {
			connected: false,
			sessionExists: false,
			error: dbErr.message || 'Database query failed'
		};
		health.status = 'degraded';
	}

	// 2. Check GrammY Bot API connectivity
	try {
		const bot = getBot();
		if (bot) {
			const me = await bot.api.getMe();
			health.bot = {
				configured: true,
				botUser: `@${me.username} (${me.first_name})`
			};
		} else {
			health.bot = {
				configured: false,
				error: 'BOT_TOKEN is not configured'
			};
			health.status = 'degraded';
		}
	} catch (botErr: any) {
		health.bot = {
			configured: false,
			error: botErr.message || 'Bot getMe API call failed'
		};
		health.status = 'degraded';
	}

	return json(health);
};
