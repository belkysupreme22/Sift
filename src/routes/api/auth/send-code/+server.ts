import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createMtprotoClient } from '$lib/bot/index.js';
import * as dotenv from 'dotenv';
dotenv.config();

// Temporary in-memory cache for web-initiated logins
declare global {
	var __sift_web_auth_cache: Map<string, { client: any; phoneCodeHash: string; phoneNumber: string }> | undefined;
}

if (!globalThis.__sift_web_auth_cache) {
	globalThis.__sift_web_auth_cache = new Map();
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { phoneNumber } = await request.json();
		const cleanPhone = (phoneNumber || '').replace(/[\s-]/g, '');

		if (!cleanPhone.startsWith('+') || cleanPhone.length < 8) {
			return json({ error: 'Please provide a valid international phone number (e.g. +1234567890)' }, { status: 400 });
		}

		const apiId = parseInt(process.env.TG_API_ID || '0', 10);
		const apiHash = process.env.TG_API_HASH || '';

		const client = createMtprotoClient('');
		await client.connect();

		const result = await client.sendCode(
			{
				apiId,
				apiHash
			},
			cleanPhone
		);

		globalThis.__sift_web_auth_cache!.set(cleanPhone, {
			client,
			phoneCodeHash: result.phoneCodeHash,
			phoneNumber: cleanPhone
		});

		return json({
			success: true,
			phoneNumber: cleanPhone,
			phoneCodeHash: result.phoneCodeHash
		});
	} catch (err: any) {
		console.error('[API Send Code Error]', err);
		return json({ error: err.message || 'Failed to send verification code' }, { status: 500 });
	}
};
