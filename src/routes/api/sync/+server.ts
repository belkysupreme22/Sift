import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncChannels } from '$lib/bot/index.js';

export const POST: RequestHandler = async () => {
	try {
		console.log('[API] Triggering channel sync...');
		const result = await syncChannels();
		return json({
			success: true,
			...result
		});
	} catch (err: any) {
		console.error('[API Sync Error]', err);
		return json({ error: err.message || 'Sync failed' }, { status: 500 });
	}
};
