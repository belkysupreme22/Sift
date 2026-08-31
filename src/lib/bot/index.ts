import { Bot, InlineKeyboard } from 'grammy';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { computeCheck } from 'telegram/Password.js';
import * as db from '../db/index.js';
import type { NewChannel, NewMessage } from '../db/schema.js';
import * as dotenv from 'dotenv';

dotenv.config();

// In-memory authentication state per telegram user ID
interface AuthState {
	step: 'idle' | 'awaiting_phone' | 'awaiting_code' | 'awaiting_password' | 'awaiting_channel_filter';
	phoneNumber?: string;
	phoneCodeHash?: string;
	client?: TelegramClient;
}

const authStates = new Map<number, AuthState>();

function getTgCredentials() {
	const rawApiId = (process.env.TG_API_ID || '').trim().replace(/^["']|["']$/g, '');
	const apiId = parseInt(rawApiId || '0', 10);
	const apiHash = (process.env.TG_API_HASH || '').trim().replace(/^["']|["']$/g, '');
	const botToken = (process.env.BOT_TOKEN || '').trim().replace(/^["']|["']$/g, '');

	return { apiId, apiHash, botToken };
}

let activeBotInstance: Bot | null = null;

export function getBot(): Bot | null {
	if (!activeBotInstance) {
		const { botToken } = getTgCredentials();
		if (!botToken) return null;
		activeBotInstance = new Bot(botToken);
	}
	return activeBotInstance;
}

/**
 * Returns a sanitized base URL for the WebApp/browser links without trailing slashes
 */
export function getCleanWebAppUrl(path = ''): string {
	let base = (process.env.WEBAPP_URL || '').trim();
	if (!base) return '';
	base = base.replace(/\/+$/, '');
	if (!path) return base;
	const cleanPath = path.startsWith('/') ? path : `/${path}`;
	return `${base}${cleanPath}`;
}

/**
 * Safely adds both WebApp (Mini App) and Direct Web Browser URL buttons based on Telegram Bot API rules
 */
function addAppButton(keyboard: InlineKeyboard, text: string, pathOrUrl = '') {
	let url = pathOrUrl.trim();
	if (!url.startsWith('http://') && !url.startsWith('https://')) {
		url = getCleanWebAppUrl(pathOrUrl);
	}
	if (!url) return keyboard;

	const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
	if (isLocal) {
		// Telegram Bot API strictly forbids 'localhost' in inline keyboard buttons
		return keyboard;
	}
	if (url.startsWith('https://')) {
		keyboard.webApp(text, url).url('🌐 Browser Link', url);
		return keyboard;
	}
	if (url.startsWith('http://')) {
		keyboard.url(text, url);
		return keyboard;
	}
	return keyboard;
}

function getMarkup(keyboard: InlineKeyboard) {
	return keyboard.inline_keyboard.length > 0 ? keyboard : undefined;
}

/**
 * Creates a clean TelegramClient instance
 */
export function createMtprotoClient(sessionString = '') {
	const { apiId, apiHash } = getTgCredentials();
	if (!apiId || !apiHash) {
		throw new Error('TG_API_ID and TG_API_HASH must be set in environment');
	}
	const stringSession = new StringSession(sessionString);
	const client = new TelegramClient(stringSession, apiId, apiHash, {
		connectionRetries: 10,
		useWSS: false,
		autoReconnect: true
	});
	client.setLogLevel('error');
	return client;
}

/**
 * Returns the list of tracked channel handles or IDs from environment variables.
 * Prioritizes TRACKED_CHANNELS, with CHANNELS_ALLOWLIST as fallback.
 */
export function getTrackedChannels(): string[] {
	const raw = (process.env.TRACKED_CHANNELS || process.env.CHANNELS_ALLOWLIST || '').trim();
	if (!raw) return [];
	return raw
		.split(/[\s,]+/)
		.map((s) => s.trim().toLowerCase().replace(/^@/, ''))
		.filter((s) => s.length > 0);
}

/**
 * Pulls and stores UNREAD messages for each channel in the allowlist (one channel at a time sequentially).
 * Pulls all messages after that dialog's read_inbox_max_id via GramJS getDialogs (no cap on backlog size).
 * DOES NOT mark messages as read in Telegram (marking as read happens at view-time in the timeline route).
 */
export async function syncChannels(): Promise<{
	syncedChannelsCount: number;
	totalMessagesCount: number;
	channelsDetail: Array<{ name: string; count: number }>;
}> {
	const sessionRecord = await db.getSession();
	if (!sessionRecord || !sessionRecord.sessionString) {
		throw new Error('No active Telegram session found. Please log in first.');
	}

	const trackedList = getTrackedChannels();
	const client = await getSharedClient();
	if (!client) {
		throw new Error('Could not establish GramJS client connection.');
	}

	let totalMessagesCount = 0;
	const channelsDetail: Array<{ name: string; count: number }> = [];

	try {
		console.log('[Sync] Fetching dialogs to discover subscribed channels and read_inbox_max_id...');
		const dialogs = await client.getDialogs({ limit: 100 });

		const channelDialogs = dialogs.filter((dialog) => {
			if (!dialog.isChannel) return false;

			if (trackedList.length > 0) {
				const username = (dialog.entity as any)?.username?.toLowerCase() || '';
				const title = (dialog.title || '').toLowerCase();
				const idStr = dialog.id?.toString() || '';

				return (
					trackedList.includes(username) ||
					trackedList.includes(title) ||
					trackedList.includes(idStr)
				);
			}

			return true;
		});

		console.log(`[Sync] Syncing unread backlog for ${channelDialogs.length} channels sequentially...`);

		// Process ONE channel at a time sequentially to strictly stay under MTProto rate limits
		for (const dialog of channelDialogs) {
			try {
				const entity = dialog.entity;
				if (!entity) continue;

				const channelId = dialog.id?.toString() || (entity as any).id?.toString();
				const channelName = dialog.title || (entity as any).title || (entity as any).username || 'Unnamed Channel';

				// 1. Upsert channel in DB
				const channelData: NewChannel = {
					id: channelId,
					name: channelName
				};
				await db.upsertChannel(channelData);

				// 2. Determine read_inbox_max_id (only pull messages newer than this)
				const readInboxMaxId = Number(
					dialog.dialog?.readInboxMaxId ?? (dialog as any).readInboxMaxId ?? 0
				);
				const unreadCount = Number(dialog.unreadCount ?? dialog.dialog?.unreadCount ?? 0);

				console.log(`[Sync] Channel "${channelName}" (ID: ${channelId}) -> readInboxMaxId: ${readInboxMaxId}, unreadCount: ${unreadCount}`);

				// Clean up any previously stored messages for this channel that are now marked as read
				if (readInboxMaxId > 0) {
					await db.removeReadMessages(channelId, readInboxMaxId);
				}

				// If channel is already fully read in Telegram, skip network getMessages call to finish sync in seconds
				if (unreadCount === 0 && readInboxMaxId > 0) {
					channelsDetail.push({
						name: channelName,
						count: 0
					});
					continue;
				}

				// 3. Pull all messages newer than readInboxMaxId (no cap on backlog size)
				const newMessages: NewMessage[] = [];
				let offsetId = 0;
				let keepFetching = true;

				while (keepFetching) {
					const batch: any[] = await client.getMessages(entity, {
						limit: unreadCount > 0 ? Math.min(100, unreadCount) : 100,
						minId: readInboxMaxId > 0 ? readInboxMaxId : undefined,
						offsetId: offsetId > 0 ? offsetId : undefined
					});

					if (!batch || batch.length === 0) {
						break;
					}

					let addedFromBatch = 0;
					for (const msg of batch) {
						if (!msg || !msg.id) continue;

						const msgId = Number(msg.id);
						// Stop if we hit a message at or below readInboxMaxId
						if (readInboxMaxId > 0 && msgId <= readInboxMaxId) {
							keepFetching = false;
							continue;
						}

						const postedAt = msg.date ? new Date(msg.date * 1000) : new Date();
						const textContent = typeof msg.message === 'string' ? msg.message : '';
						const hasMedia = Boolean(msg.media);

						if (textContent || hasMedia) {
							newMessages.push({
								id: `${channelId}:${msg.id}`,
								channelId,
								telegramMessageId: msgId,
								postedAt,
								text: textContent,
								hasMedia
							});
							addedFromBatch++;
						}
					}

					if (batch.length < 100 || addedFromBatch === 0 || newMessages.length >= unreadCount) {
						keepFetching = false;
					} else {
						offsetId = Number(batch[batch.length - 1].id);
						// Small polite delay between pagination batches
						await new Promise((r) => setTimeout(r, 100));
					}
				}

				// 4. Save unread messages to Postgres (without marking as read in Telegram!)
				if (newMessages.length > 0) {
					await db.upsertMessages(newMessages);
				}

				totalMessagesCount += newMessages.length;
				channelsDetail.push({
					name: channelName,
					count: newMessages.length
				});

				console.log(`[Sync] Stored ${newMessages.length} unread messages for "${channelName}". (Left unread in Telegram)`);

				// Small polite delay between active channels
				await new Promise((r) => setTimeout(r, 100));
			} catch (err: any) {
				console.error(`[Sync] Error syncing channel "${dialog.title}":`, err.message || err);
			}
		}
	} catch (err: any) {
		console.error('[Sync Error]', err);
		throw err;
	}

	return {
		syncedChannelsCount: channelsDetail.length,
		totalMessagesCount,
		channelsDetail
	};
}

/**
 * Initializes and starts the grammY bot
 */
export function startBot(): Bot | null {
	const { botToken } = getTgCredentials();
	if (!botToken) {
		console.warn('[Bot] BOT_TOKEN is not set. Bot will not start.');
		return null;
	}

	const bot = new Bot(botToken);
	activeBotInstance = bot;

	// Register command list and bot description with Telegram
	bot.api
		.setMyCommands([
			{ command: 'start', description: 'Start setup or open timeline' },
			{ command: 'sync', description: 'Fetch latest channel stories' },
			{ command: 'channels', description: 'Choose channels or sync all' },
			{ command: 'status', description: 'Check connection and DB stats' },
			{ command: 'help', description: 'View guide and instructions' },
			{ command: 'logout', description: 'Disconnect Telegram session' }
		])
		.catch(() => {});

	bot.api
		.setMyDescription(
			`Welcome to Sift — your clean, noise-free Telegram channel reader!\n\n` +
			`✨ What Sift does:\n` +
			`• 📅 Chronological Timeline: Organizes stories by Day, Week, and Month.\n` +
			`• 📖 Complete Raw Text: Preserves full unedited stories and multi-language scripts (Amharic/Ge'ez, English, etc.) without algorithmic loss.\n` +
			`• ⚡ Interactive Mini App: Instant fuzzy search (⌘K), bookmarking, voice text-to-speech, and volume-coded channel metrics.\n\n` +
			`🚀 Send /start to connect your account and index your channels!`
		)
		.catch(() => {});

	bot.api
		.setMyShortDescription(
			`Minimalist, chronological daily timeline for your Telegram channels without algorithmic noise.`
		)
		.catch(() => {});

	// Restore the bottom-left Telegram Menu Button to show the list of bot commands
	bot.api
		.setChatMenuButton({
			menu_button: {
				type: 'commands'
			}
		})
		.catch((err) => {
			console.warn('[Bot] Failed to set menu button:', err.message);
		});

	// /start handler
	bot.command('start', async (ctx) => {
		const userId = ctx.from?.id;
		if (!userId) return;

		const oldState = authStates.get(userId);
		if (oldState?.client) {
			try {
				await oldState.client.disconnect();
			} catch (_) {}
		}

		const existingSession = await db.getSession();
		if (existingSession && existingSession.sessionString) {
			const webAppUrl = getCleanWebAppUrl('/');
			const isLocal = webAppUrl.includes('localhost') || webAppUrl.includes('127.0.0.1');
			const keyboard = new InlineKeyboard();

			if (webAppUrl && !isLocal) {
				addAppButton(keyboard, '✨ Open Sift Timeline', webAppUrl).row();
			}
			keyboard.text('🔄 Sync Latest Stories', 'action_sync_all');

			let startMsg =
				`👋 **Welcome back to Sift!**\n\n` +
				`Your Telegram account is connected and actively indexing.\n\n` +
				`📌 **Quick Actions:**\n` +
				`• /sync — Pull latest stories from your channels\n` +
				`• /channels — Configure channel filter (or sync all)\n` +
				`• /status — Check database and session status\n` +
				`• /logout — Disconnect session`;

			if (webAppUrl && isLocal) {
				startMsg += `\n\n👉 **Open Timeline:**\n${webAppUrl}`;
			}

			await ctx.reply(startMsg, { parse_mode: 'Markdown', reply_markup: getMarkup(keyboard) });
			return;
		}

		authStates.set(userId, { step: 'awaiting_phone' });

		const keyboard = new InlineKeyboard();
		const webAppUrl = getCleanWebAppUrl('/login');
		if (webAppUrl) {
			addAppButton(keyboard, '⚡ Web Login (Recommended)', webAppUrl).row();
		}

		await ctx.reply(
			`👋 **Welcome to Sift**\n\n` +
				`Sift transforms your cluttered Telegram channels into a clean, chronological daily timeline without algorithmic noise or AI distortion.\n\n` +
				`✨ **What Sift does:**\n` +
				`• 📅 **Chronological Timeline**: Groups updates by Day, Week, and Month\n` +
				`• 📖 **Zero AI Loss**: Preserves full unedited stories and multi-language scripts\n` +
				`• ⚡ **Interactive Mini App**: Real-time search, bookmarks, audio reader, and channel filtering\n\n` +
				`🚀 **Step 1 of 2:** Connect your Telegram account\n` +
				`Reply with your phone number in international format (e.g. \`+251911223344\` or \`+1234567890\`), or tap Web Login below:`,
			{ parse_mode: 'Markdown', reply_markup: getMarkup(keyboard) }
		);
	});

	// /help handler
	bot.command('help', async (ctx) => {
		await ctx.reply(
			`**Sift User Guide**\n\n` +
				`1. **Connect**: Send /start to log in securely with your Telegram account.\n` +
				`2. **Sync**: Send /sync to pull chronological stories from all your subscribed channels.\n` +
				`3. **View**: Open the Mini App to read unedited daily stories in clean chronological cards.\n` +
				`4. **Filter**: Use /channels if you want to index all channels or restrict to specific handles.`,
			{ parse_mode: 'Markdown' }
		);
	});

	// /channels handler
	bot.command('channels', async (ctx) => {
		const session = await db.getSession();
		if (!session) {
			await ctx.reply(`Please run /start to log in before configuring channels.`);
			return;
		}

		const keyboard = new InlineKeyboard()
			.text('Proceed with All Channels', 'action_sync_all')
			.row()
			.text('Set Custom Channel List', 'action_set_custom');

		await ctx.reply(
			`**Channel Indexing**\n\n` +
				`By default, Sift syncs all channels you are subscribed to.\n\n` +
				`Choose an option below:`,
			{ parse_mode: 'Markdown', reply_markup: getMarkup(keyboard) }
		);
	});

	// Callback query handlers
	bot.callbackQuery('action_sync_all', async (ctx) => {
		await ctx.answerCallbackQuery({
			text: 'Syncing channels, please wait...',
			show_alert: false
		});
		await executeSync(ctx);
	});

	bot.callbackQuery('action_set_custom', async (ctx) => {
		await ctx.answerCallbackQuery({
			text: 'Please enter channel handles',
			show_alert: false
		});
		const userId = ctx.from?.id;
		if (userId) {
			authStates.set(userId, { step: 'awaiting_channel_filter' });
		}
		await ctx.reply(
			`Reply with comma-separated channel usernames or IDs to track (e.g. \`@channel1, @channel2\`):`
		);
	});

	// /status handler
	bot.command('status', async (ctx) => {
		try {
			const session = await db.getSession();
			const channels = await db.getAllChannels();
			const dayCards = await db.getDayCards();
			const rawAllowlist = process.env.TRACKED_CHANNELS || process.env.CHANNELS_ALLOWLIST || 'All subscribed channels';

			const statusMsg =
				`**Sift Status**\n\n` +
				`• **MTProto Session**: ${session ? 'Connected' : 'Not logged in'}\n` +
				`• **Tracked Channels**: \`${rawAllowlist}\`\n` +
				`• **Channels in DB**: ${channels.length}\n` +
				`• **Daily Cards**: ${dayCards.length}\n` +
				`• **Web App URL**: ${getCleanWebAppUrl() || 'Not configured'}`;

			const keyboard = new InlineKeyboard();
			if (process.env.WEBAPP_URL) {
				addAppButton(keyboard, 'Open Timeline', process.env.WEBAPP_URL).row();
			}
			keyboard.text('Sync Now', 'action_sync_all');

			await ctx.reply(statusMsg, {
				parse_mode: 'Markdown',
				reply_markup: getMarkup(keyboard)
			});
		} catch (err: any) {
			await ctx.reply(`Status check error: ${err.message || err}`);
		}
	});

	// /logout handler
	bot.command('logout', async (ctx) => {
		await db.clearSession();
		const userId = ctx.from?.id;
		if (userId) {
			const state = authStates.get(userId);
			if (state?.client) {
				try {
					await state.client.disconnect();
				} catch (_) {}
			}
			authStates.delete(userId);
		}

		await ctx.reply(
			`**Session cleared.**\n` +
				`Your MTProto session has been removed from the database.\n` +
				`Send /start whenever you wish to reconnect.`,
			{ parse_mode: 'Markdown' }
		);
	});

	async function executeSync(ctx: any) {
		const statusMsg = await ctx.reply(`Syncing your subscribed channels, please wait...\nConnecting to Telegram and pulling messages...`);

		try {
			const result = await syncChannels();

			const channelBreakdown = result.channelsDetail
				.map((c) => `• **${c.name}**: ${c.count} messages`)
				.join('\n');

			const webAppUrl = (process.env.WEBAPP_URL || '').trim();
			const isLocal = webAppUrl.includes('localhost') || webAppUrl.includes('127.0.0.1');

			let replyText =
				`**Sync complete**\n\n` +
				`Synced **${result.syncedChannelsCount} channels** (${result.totalMessagesCount} messages):\n` +
				`${channelBreakdown || 'No messages found'}`;

			const keyboard = new InlineKeyboard();
			if (webAppUrl) {
				if (isLocal) {
					replyText += `\n\n👉 **Open your timeline:**\n${webAppUrl}`;
				} else {
					replyText += `\n\nTap below to view your timeline:`;
					addAppButton(keyboard, 'View Timeline', webAppUrl);
				}
			}

			await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, replyText, {
				parse_mode: 'Markdown',
				reply_markup: getMarkup(keyboard)
			});
		} catch (err: any) {
			console.error('[Bot Sync Error]', err);
			await ctx.api.editMessageText(
				ctx.chat.id,
				statusMsg.message_id,
				`Sync failed: ${err.message || 'Unknown error'}\n\nIf session expired, send /start to reconnect.`,
				{ parse_mode: 'Markdown' }
			);
		}
	}

	// /sync handler
	bot.command('sync', async (ctx) => {
		await executeSync(ctx);
	});

	// Text message handler for conversational login flow
	bot.on('message:text', async (ctx) => {
		const userId = ctx.from?.id;
		if (!userId) return;

		const text = ctx.message.text.trim();
		const state = authStates.get(userId);

		if (!state || state.step === 'idle') {
			return;
		}

		try {
			// Step 1: User provides phone number
			if (state.step === 'awaiting_phone') {
				const phoneNumber = text.replace(/[\s-]/g, '');
				if (!phoneNumber.startsWith('+') || phoneNumber.length < 8) {
					await ctx.reply(
						`Please enter a valid international phone number starting with \`+\` (e.g. \`+251911223344\`).`,
						{ parse_mode: 'Markdown' }
					);
					return;
				}

				await ctx.reply(`Sending verification code to **${phoneNumber}**...`, {
					parse_mode: 'Markdown'
				});

				const client = createMtprotoClient('');
				await client.connect();

				const { apiId, apiHash } = getTgCredentials();
				const result = await client.sendCode(
					{
						apiId,
						apiHash
					},
					phoneNumber
				);

				authStates.set(userId, {
					step: 'awaiting_code',
					phoneNumber,
					phoneCodeHash: result.phoneCodeHash,
					client
				});

				await ctx.reply(
					`**Code sent to your Telegram app.**\n\n` +
						`To prevent Telegram from blocking the code in chat, please reply with spaces between digits (e.g. \`6 6 6 8 8\` or \`66 688\`).`,
					{ parse_mode: 'Markdown' }
				);
				return;
			}

			// Step 2: User provides OTP code
			if (state.step === 'awaiting_code') {
				const phoneCode = text.replace(/\D/g, '');
				if (!state.client || !state.phoneNumber || !state.phoneCodeHash) {
					await ctx.reply(`Session expired. Please send /start to restart.`);
					authStates.delete(userId);
					return;
				}

				if (!phoneCode || phoneCode.length < 4) {
					await ctx.reply(`Please reply with your code (e.g. \`66 688\`).`);
					return;
				}

				await ctx.reply(`Verifying code...`);

				try {
					await state.client.invoke(
						new Api.auth.SignIn({
							phoneNumber: state.phoneNumber,
							phoneCodeHash: state.phoneCodeHash,
							phoneCode: phoneCode
						})
					);

					const sessionString = (state.client.session as StringSession).save();
					await db.saveSession(sessionString);
					try {
						await state.client.disconnect();
					} catch (_) {}
					authStates.delete(userId);

					const webAppUrl = process.env.WEBAPP_URL || '';
					const keyboard = new InlineKeyboard();
					if (webAppUrl) {
						addAppButton(keyboard, 'Open Timeline', webAppUrl).row();
					}
					keyboard.text('Proceed with All Channels', 'action_sync_all');

					await ctx.reply(
						`**Login successful.**\n\n` +
							`Your session is active. Tap below to sync all your subscribed channels immediately:`,
						{ parse_mode: 'Markdown', reply_markup: getMarkup(keyboard) }
					);
				} catch (err: any) {
					const errMsg = err.message || err.errorMessage || '';
					if (
						errMsg.includes('SESSION_PASSWORD_NEEDED') ||
						err.errorMessage === 'SESSION_PASSWORD_NEEDED'
					) {
						authStates.set(userId, {
							...state,
							step: 'awaiting_password'
						});

						await ctx.reply(
							`**2FA Password Required**\n\nPlease reply with your Telegram Two-Step Verification cloud password:`,
							{ parse_mode: 'Markdown' }
						);
						return;
					}

					if (errMsg.includes('PHONE_CODE_EXPIRED')) {
						await ctx.reply(
							`The code was invalidated by Telegram. Please send /start and reply with spaces (e.g. \`6 6 6 8 8\`).`,
							{ parse_mode: 'Markdown' }
						);
						if (state.client) {
							try {
								await state.client.disconnect();
							} catch (_) {}
						}
						authStates.delete(userId);
						return;
					}

					if (errMsg.includes('PHONE_CODE_INVALID')) {
						await ctx.reply(
							`Invalid verification code. Please check your Telegram app and reply formatted like \`66 688\`.`,
							{ parse_mode: 'Markdown' }
						);
						return;
					}

					throw err;
				}
				return;
			}

			// Step 3: User provides 2FA password
			if (state.step === 'awaiting_password') {
				if (!state.client) {
					await ctx.reply(`Session expired. Please send /start to begin again.`);
					authStates.delete(userId);
					return;
				}

				await ctx.reply(`Checking 2FA password...`);

				const passwordSrpResult = await state.client.invoke(new Api.account.GetPassword());
				const passwordSrpCheck = await computeCheck(passwordSrpResult, text);
				await state.client.invoke(
					new Api.auth.CheckPassword({
						password: passwordSrpCheck
					})
				);

				const sessionString = (state.client.session as StringSession).save();
				await db.saveSession(sessionString);
				try {
					await state.client.disconnect();
				} catch (_) {}
				authStates.delete(userId);

				const webAppUrl = process.env.WEBAPP_URL || '';
				const keyboard = new InlineKeyboard();
				if (webAppUrl) {
					addAppButton(keyboard, 'Open Timeline', webAppUrl).row();
				}
				keyboard.text('Proceed with All Channels', 'action_sync_all');

				await ctx.reply(
					`**Login successful.**\n\n` +
						`Two-step verification confirmed. Tap below to sync your subscribed channels:`,
					{ parse_mode: 'Markdown', reply_markup: getMarkup(keyboard) }
				);
				return;
			}

			// Custom channel filter input
			if (state.step === 'awaiting_channel_filter') {
				process.env.CHANNELS_ALLOWLIST = text;
				authStates.delete(userId);

				await ctx.reply(`Channel filter updated to: \`${text}\`\n\nStarting sync now...`);
				await executeSync(ctx);
				return;
			}
		} catch (err: any) {
			console.error('[Bot Auth Error]', err);
			await ctx.reply(
				`Authentication error: ${err.message || err.errorMessage || 'Invalid credentials'}\n\nSend /start to try again.`,
				{ parse_mode: 'Markdown' }
			);
			if (state?.client) {
				try {
					await state.client.disconnect();
				} catch (_) {}
			}
			authStates.delete(userId);
		}
	});

	// Global error handler
	bot.catch((err) => {
		console.error('[Bot Global Error]', err);
	});

	// Start long-polling in background with webhook cleanup and auto-recovery
	let isPollingRunning = false;

	async function launchPolling() {
		if (isPollingRunning) return;
		isPollingRunning = true;

		try {
			console.log('[Bot] Deleting any existing Telegram webhooks to ensure getUpdates long-polling starts cleanly...');
			await bot.api.deleteWebhook({ drop_pending_updates: false }).catch((err) => {
				console.warn('[Bot] Note on deleteWebhook:', err?.message);
			});

			console.log('[Bot] Starting Telegram bot long-polling...');
			await bot.start({
				drop_pending_updates: false,
				onStart: (botInfo) => {
					console.log(`[Bot] @${botInfo.username} is now online and listening for updates!`);
				}
			});
		} catch (err: any) {
			isPollingRunning = false;
			if (err?.message === 'Aborted delay' || err?.name === 'AbortError') {
				console.log('[Bot] Long-polling stopped cleanly.');
				return;
			}

			// Handle 401 Unauthorized cleanly without spamming every 5 seconds
			if (err?.error_code === 401 || err?.description?.includes('Unauthorized') || err?.message?.includes('401')) {
				console.warn('[Bot Warning] BOT_TOKEN is unauthorized (401). Bot polling is paused until a valid token is provided in environment variables.');
				return;
			}

			console.error('[Bot Start Error]', err);
			console.log('[Bot] Will retry bot long-polling in 30 seconds...');
			setTimeout(() => {
				launchPolling();
			}, 30000);
		}
	}

	launchPolling();

	return bot;
}

// In-memory LRU-like cache for media buffers to serve images blazing fast
const mediaMemoryCache = new Map<string, { buffer: Buffer; mimeType: string }>();
let sharedMtprotoClient: TelegramClient | null = null;
let sharedSessionString: string | null = null;

async function getSharedClient(): Promise<TelegramClient | null> {
	const sessionRecord = await db.getSession();
	if (!sessionRecord || !sessionRecord.sessionString) return null;

	if (sharedMtprotoClient && sharedSessionString === sessionRecord.sessionString && sharedMtprotoClient.connected) {
		return sharedMtprotoClient;
	}

	try {
		if (sharedMtprotoClient) {
			try { await sharedMtprotoClient.disconnect(); } catch (_) {}
		}
		sharedMtprotoClient = createMtprotoClient(sessionRecord.sessionString);
		await sharedMtprotoClient.connect();
		sharedSessionString = sessionRecord.sessionString;
		return sharedMtprotoClient;
	} catch (err: any) {
		console.error('[MTProto Shared Client Error]', err?.message);
		return null;
	}
}

let cachedUserInfo: { name: string; username?: string; initial: string } | null = null;

export async function getConnectedUserInfo(): Promise<{ name: string; username?: string; initial: string } | null> {
	if (cachedUserInfo) return cachedUserInfo;
	try {
		const client = await getSharedClient();
		if (!client) return null;
		const me: any = await client.getMe().catch(() => null);
		if (!me) return null;
		const firstName = me.firstName || '';
		const lastName = me.lastName || '';
		const username = me.username || '';
		const fullName = `${firstName} ${lastName}`.trim() || username || 'Telegram User';
		const initial = (firstName[0] || username[0] || fullName[0] || 'T').toUpperCase();
		cachedUserInfo = { name: fullName, username, initial };
		return cachedUserInfo;
	} catch {
		return null;
	}
}

export function disconnectSharedClient() {
	if (sharedMtprotoClient) {
		try {
			sharedMtprotoClient.disconnect();
		} catch (_) {}
		sharedMtprotoClient = null;
		sharedSessionString = null;
	}
	cachedUserInfo = null;
	mediaMemoryCache.clear();
}

export const getSharedGramJsClient = getSharedClient;
export { getSharedClient };

/**
 * Marks a channel as read in Telegram (clears Telegram's own unread badge).
 * Called at VIEW TIME when opening the timeline route in Sift.
 */
export async function markChannelAsRead(channelIdOrHandle: string, maxId = 0): Promise<boolean> {
	try {
		const client = await getSharedClient();
		if (!client) return false;

		const entity = await client.getInputEntity(channelIdOrHandle).catch(async () => {
			return await client?.getEntity(channelIdOrHandle);
		}).catch(() => null);

		if (!entity) return false;

		// GramJS markAsRead sends ReadHistory request to Telegram
		await client.markAsRead(entity as any, maxId || undefined).catch(async () => {
			await client?.send(
				new Api.channels.ReadHistory({
					channel: entity as any,
					maxId: maxId || 0
				})
			).catch(() => {});
		});

		console.log(`[ReadHistory] Marked channel ${channelIdOrHandle} as read in Telegram at view-time.`);
		return true;
	} catch (err: any) {
		console.warn(`[ReadHistory Error] Failed to mark channel ${channelIdOrHandle} as read:`, err?.message);
		return false;
	}
}

/**
 * Marks multiple channels as read in Telegram at view-time
 */
export async function markChannelsAsRead(channelIds: string[]): Promise<void> {
	for (const id of channelIds) {
		await markChannelAsRead(id);
		await new Promise((r) => setTimeout(r, 100));
	}
}

/**
 * Downloads binary image / media buffer on-demand for a given channel and message ID
 */
export async function getMessageMediaBuffer(
	channelId: string,
	messageId: number
): Promise<{ buffer: Buffer; mimeType: string } | null> {
	const cacheKey = `${channelId}:${messageId}`;
	if (mediaMemoryCache.has(cacheKey)) {
		return mediaMemoryCache.get(cacheKey)!;
	}

	const client = await getSharedClient();
	if (!client) return null;

	try {
		// Resolve entity (channel or chat)
		const entity = await client.getInputEntity(channelId).catch(() => channelId);
		const messages: any[] = await client.getMessages(entity as any, { ids: [messageId] });
		
		if (!messages || messages.length === 0 || !messages[0]?.media) {
			return null;
		}

		const msg = messages[0];
		const downloaded = await client.downloadMedia(msg, {
			workers: 1
		});

		if (!downloaded || !(downloaded instanceof Buffer || downloaded instanceof Uint8Array)) {
			return null;
		}

		const finalBuffer = Buffer.isBuffer(downloaded) ? downloaded : Buffer.from(downloaded);
		const mimeType = msg.media?.document?.mimeType || 'image/jpeg';

		const result = {
			buffer: finalBuffer,
			mimeType
		};

		// Keep up to 150 items in fast cache
		if (mediaMemoryCache.size > 150) {
			const oldestKey = mediaMemoryCache.keys().next().value;
			if (oldestKey) mediaMemoryCache.delete(oldestKey);
		}
		mediaMemoryCache.set(cacheKey, result);

		return result;
	} catch (err: any) {
		console.warn(`[Media Proxy] Could not download media for message ${channelId}:${messageId}:`, err?.message);
		return null;
	}
}

