import type { PageServerLoad } from './$types';
import * as db from '$lib/db/index.js';

export const load: PageServerLoad = async ({ url }) => {
	const selectedChannelId = url.searchParams.get('channel') || undefined;

	try {
		const [channels, dayCards, session] = await Promise.all([
			db.getAllChannels().catch(() => []),
			db.getDayCards(selectedChannelId).catch(() => []),
			db.getSession().catch(() => null)
		]);

		const totalMessages = dayCards.reduce((acc, card) => acc + card.messageCount, 0);

		return {
			channels,
			dayCards,
			selectedChannelId: selectedChannelId || null,
			isLoggedIn: Boolean(session?.sessionString),
			sessionUpdatedAt: session?.updatedAt ? session.updatedAt.toISOString() : null,
			stats: {
				channelCount: channels.length,
				dayCount: dayCards.length,
				messageCount: totalMessages
			}
		};
	} catch (err: any) {
		console.error('[Page Load Error]', err);
		return {
			channels: [],
			dayCards: [],
			selectedChannelId: null,
			isLoggedIn: false,
			stats: {
				channelCount: 0,
				dayCount: 0,
				messageCount: 0
			},
			error: err.message || 'Failed to load timeline data'
		};
	}
};
