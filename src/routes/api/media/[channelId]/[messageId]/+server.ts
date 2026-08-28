import { getMessageMediaBuffer } from '$lib/bot/index.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ params }) => {
	const { channelId, messageId } = params;
	const msgNum = parseInt(messageId || '0', 10);

	if (!channelId || !msgNum) {
		return new Response('Invalid channel or message ID', { status: 400 });
	}

	try {
		const media = await getMessageMediaBuffer(channelId, msgNum);
		if (!media || !media.buffer || media.buffer.length === 0) {
			return new Response('Media not found or unavailable', { status: 404 });
		}

		return new Response(media.buffer, {
			headers: {
				'Content-Type': media.mimeType || 'image/jpeg',
				'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
				'Content-Length': media.buffer.length.toString()
			}
		});
	} catch (err: any) {
		console.error('[Media API Error]', err);
		return new Response('Failed to retrieve media', { status: 500 });
	}
};
