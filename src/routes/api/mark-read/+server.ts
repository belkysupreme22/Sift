import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as db from '$lib/db/index.js';
import { markChannelAsRead } from '$lib/bot/index.js';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const { channelId, telegramMessageId, messageId } = body;

		if (!channelId) {
			return json({ error: 'channelId is required' }, { status: 400 });
		}

		const msgId = telegramMessageId ? Number(telegramMessageId) : (messageId ? Number(messageId.split(':')[1]) : 0);

		// 1. Advance read pointer in Telegram MTProto
		await markChannelAsRead(channelId, msgId).catch((err) => {
			console.warn(`[MarkRead API] Warning marking channel ${channelId} read in Telegram:`, err?.message);
		});

		// 2. Remove read message(s) from Postgres cache
		if (msgId > 0) {
			await db.removeReadMessages(channelId, msgId);
		} else {
			// If no specific message ID is provided, clear all current cached messages for this channel
			await db.removeReadMessages(channelId, 2147483647);
		}

		return json({
			success: true,
			channelId,
			messageId: messageId || (msgId ? `${channelId}:${msgId}` : null)
		});
	} catch (err: any) {
		console.error('[MarkRead API Error]', err);
		return json({ error: err.message || 'Failed to mark as read' }, { status: 500 });
	}
};
