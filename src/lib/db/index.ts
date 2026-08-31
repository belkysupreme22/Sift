import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
import { eq, desc, and, lte } from 'drizzle-orm';
import type { DayCard, Message, NewChannel, NewMessage } from './schema.js';
import * as dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

let pool: pg.Pool | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
	if (!dbInstance) {
		const connectionString = process.env.DATABASE_URL;
		if (!connectionString) {
			console.warn('[DB] DATABASE_URL is not set. Database operations will fail unless configured.');
		}

		pool = new Pool({
			connectionString: connectionString || '',
			ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
			max: 10,
			idleTimeoutMillis: 30000,
			connectionTimeoutMillis: 5000
		});

		pool.on('error', (err) => {
			console.error('[DB] Unexpected client error on idle pool', err);
		});

		dbInstance = drizzle(pool, { schema });
	}
	return dbInstance;
}

export async function getSession(id = 'main') {
	const db = getDb();
	const rows = await db.select().from(schema.session).where(eq(schema.session.id, id)).limit(1);
	return rows[0] || null;
}

export async function saveSession(sessionString: string, id = 'main') {
	const db = getDb();
	const now = new Date();
	await db
		.insert(schema.session)
		.values({
			id,
			sessionString,
			updatedAt: now
		})
		.onConflictDoUpdate({
			target: schema.session.id,
			set: {
				sessionString,
				updatedAt: now
			}
		});
}

export async function clearSession(id = 'main') {
	const db = getDb();
	await db.delete(schema.session).where(eq(schema.session.id, id));
}

export async function clearAllUserData(id = 'main') {
	const db = getDb();
	await db.delete(schema.session).where(eq(schema.session.id, id));
	await db.delete(schema.messages);
	await db.delete(schema.channels);
}

/**
 * Removes already read messages (<= readInboxMaxId) from Postgres
 * to guarantee that Sift only stores and displays active unread messages.
 */
export async function removeReadMessages(channelId: string, readInboxMaxId: number) {
	if (readInboxMaxId <= 0) return;
	const db = getDb();
	await db
		.delete(schema.messages)
		.where(
			and(
				eq(schema.messages.channelId, channelId),
				lte(schema.messages.telegramMessageId, readInboxMaxId)
			)
		);
}

export async function upsertChannel(channel: NewChannel) {
	const db = getDb();
	await db
		.insert(schema.channels)
		.values(channel)
		.onConflictDoUpdate({
			target: schema.channels.id,
			set: { name: channel.name }
		});
}

export async function upsertMessages(newMessages: NewMessage[]) {
	if (newMessages.length === 0) return;
	const db = getDb();
	
	// Chunk in batches of 100 to avoid parameter limit in postgres
	const chunkSize = 100;
	for (let i = 0; i < newMessages.length; i += chunkSize) {
		const chunk = newMessages.slice(i, i + chunkSize);
		await db
			.insert(schema.messages)
			.values(chunk)
			.onConflictDoUpdate({
				target: schema.messages.id,
				set: {
					postedAt: schema.messages.postedAt,
					text: schema.messages.text,
					hasMedia: schema.messages.hasMedia
				}
			});
	}
}

export async function getAllChannels() {
	const db = getDb();
	return await db.select().from(schema.channels).orderBy(schema.channels.name);
}

export async function getDayCards(channelIdFilter?: string): Promise<DayCard[]> {
	const db = getDb();

	// Fetch messages joined with channel name, sorted newest first
	let query = db
		.select({
			id: schema.messages.id,
			channelId: schema.messages.channelId,
			channelName: schema.channels.name,
			telegramMessageId: schema.messages.telegramMessageId,
			postedAt: schema.messages.postedAt,
			text: schema.messages.text,
			hasMedia: schema.messages.hasMedia
		})
		.from(schema.messages)
		.innerJoin(schema.channels, eq(schema.messages.channelId, schema.channels.id))
		.orderBy(desc(schema.messages.postedAt));

	const rows = channelIdFilter
		? await query.where(eq(schema.messages.channelId, channelIdFilter))
		: await query;

	// Group rows by (channel_id, day)
	const cardMap = new Map<string, DayCard>();

	for (const row of rows) {
		const dateObj = new Date(row.postedAt);
		// Format day as YYYY-MM-DD
		const dayKey = dateObj.toISOString().split('T')[0];
		const groupKey = `${row.channelId}___${dayKey}`;

		const msg: Message = {
			id: row.id,
			channelId: row.channelId,
			telegramMessageId: row.telegramMessageId,
			postedAt: row.postedAt,
			text: row.text,
			hasMedia: row.hasMedia
		};

		if (!cardMap.has(groupKey)) {
			cardMap.set(groupKey, {
				channelId: row.channelId,
				channelName: row.channelName,
				day: dayKey,
				messageCount: 1,
				messages: [msg]
			});
		} else {
			const card = cardMap.get(groupKey)!;
			card.messageCount += 1;
			card.messages.push(msg);
		}
	}

	// Sort DayCards by day descending, then channel name
	const dayCards = Array.from(cardMap.values()).sort((a, b) => {
		if (b.day !== a.day) {
			return b.day.localeCompare(a.day);
		}
		return a.channelName.localeCompare(b.channelName);
	});

	// For each day-card, ensure messages within the card are sorted chronologically
	for (const card of dayCards) {
		card.messages.sort(
			(a, b) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime()
		);
	}

	return dayCards;
}
