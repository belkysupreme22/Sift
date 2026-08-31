import type { PageServerLoad } from './$types';
import * as db from '$lib/db/index.js';
import { markChannelAsRead, markChannelsAsRead, getConnectedUserInfo } from '$lib/bot/index.js';

export const load: PageServerLoad = async ({ url }) => {
	const selectedChannelId = url.searchParams.get('channel') || undefined;

	try {
		const session = await db.getSession().catch(() => null);
		const isLoggedIn = Boolean(session?.sessionString);

		// STRICT PRIVACY & SECURITY GATING:
		// If account is not connected, never leak private channel history or day cards!
		if (!isLoggedIn) {
			return {
				channels: [],
				dayCards: [],
				selectedChannelId: null,
				isLoggedIn: false,
				account: null,
				sessionUpdatedAt: null,
				stats: {
					channelCount: 0,
					dayCount: 0,
					messageCount: 0
				}
			};
		}

		const [channels, dayCards, account] = await Promise.all([
			db.getAllChannels().catch(() => []),
			db.getDayCards(selectedChannelId).catch(() => []),
			getConnectedUserInfo().catch(() => null)
		]);

		// MARK AS READ AT VIEW-TIME:
		// Opening the timeline in Sift clears Telegram's unread badge
		if (selectedChannelId) {
			markChannelAsRead(selectedChannelId).catch((err) => {
				console.warn(`[ViewRead] Could not mark channel ${selectedChannelId} as read:`, err?.message);
			});
		} else if (channels.length > 0) {
			markChannelsAsRead(channels.map((c) => c.id)).catch((err) => {
				console.warn('[ViewRead] Could not mark channels as read:', err?.message);
			});
		}

		const totalMessages = dayCards.reduce((acc, card) => acc + card.messageCount, 0);

		return {
			channels,
			dayCards,
			selectedChannelId: selectedChannelId || null,
			isLoggedIn: true,
			account: account || { name: 'Connected Account', username: '', initial: 'T' },
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
			sessionUpdatedAt: null,
			stats: {
				channelCount: 0,
				dayCount: 0,
				messageCount: 0
			},
			error: err.message || 'Failed to load timeline data'
		};
	}
};

