import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { computeCheck } from 'telegram/Password.js';
import * as db from '$lib/db/index.js';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { phoneNumber, phoneCode, password } = await request.json();
		const cleanPhone = (phoneNumber || '').replace(/[\s-]/g, '');
		const cleanCode = (phoneCode || '').replace(/\D/g, '');

		const cached = globalThis.__sift_web_auth_cache?.get(cleanPhone);
		if (!cached || !cached.client) {
			return json({ error: 'Auth session expired. Please request a new code.' }, { status: 400 });
		}

		const { client, phoneCodeHash } = cached;

		// 1. If 2FA password provided
		if (password) {
			const passwordSrpResult = await client.invoke(new Api.account.GetPassword());
			const passwordSrpCheck = await computeCheck(passwordSrpResult, password);
			await client.invoke(
				new Api.auth.CheckPassword({
					password: passwordSrpCheck
				})
			);

			const sessionString = (client.session as StringSession).save();
			await db.saveSession(sessionString);
			try {
				await client.disconnect();
			} catch (_) {}
			globalThis.__sift_web_auth_cache?.delete(cleanPhone);

			return json({ success: true });
		}

		// 2. Otherwise verify OTP code
		try {
			await client.invoke(
				new Api.auth.SignIn({
					phoneNumber: cleanPhone,
					phoneCodeHash,
					phoneCode: cleanCode
				})
			);

			const sessionString = (client.session as StringSession).save();
			await db.saveSession(sessionString);
			try {
				await client.disconnect();
			} catch (_) {}
			globalThis.__sift_web_auth_cache?.delete(cleanPhone);

			return json({ success: true });
		} catch (err: any) {
			const errMsg = err.message || err.errorMessage || '';
			if (
				errMsg.includes('SESSION_PASSWORD_NEEDED') ||
				err.errorMessage === 'SESSION_PASSWORD_NEEDED'
			) {
				return json({ requires2FA: true });
			}
			throw err;
		}
	} catch (err: any) {
		console.error('[API Sign In Error]', err);
		return json({ error: err.message || 'Verification failed' }, { status: 500 });
	}
};
