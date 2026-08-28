import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as db from '$lib/db/index.js';
import { disconnectSharedClient } from '$lib/bot/index.js';

export const POST: RequestHandler = async () => {
	try {
		console.log('[API] Logging out: Clearing session, channels, messages and disconnecting MTProto client...');
		await db.clearAllUserData();
		disconnectSharedClient();
		return json({ success: true });
	} catch (err: any) {
		console.error('[API Logout Error]', err);
		return json({ error: err.message || 'Logout failed' }, { status: 500 });
	}
};
