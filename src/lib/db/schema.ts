import { pgTable, text, bigint, timestamp, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const channels = pgTable('channels', {
	id: text('id').primaryKey(), // telegram channel id as string (e.g. "-1001234567890" or "tech_news")
	name: text('name').notNull()
});

export const messages = pgTable('messages', {
	id: text('id').primaryKey(), // `${channelId}:${telegramMessageId}`
	channelId: text('channel_id')
		.notNull()
		.references(() => channels.id, { onDelete: 'cascade' }),
	telegramMessageId: bigint('telegram_message_id', { mode: 'number' }).notNull(),
	postedAt: timestamp('posted_at', { withTimezone: true }).notNull(),
	text: text('text'), // raw text, no rewriting
	hasMedia: boolean('has_media').notNull().default(false)
});

export const session = pgTable('session', {
	id: text('id').primaryKey(), // fixed key, e.g. 'main'
	sessionString: text('session_string').notNull(), // gramJS session, treat as a secret
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
});

export const channelsRelations = relations(channels, ({ many }) => ({
	messages: many(messages)
}));

export const messagesRelations = relations(messages, ({ one }) => ({
	channel: one(channels, {
		fields: [messages.channelId],
		references: [channels.id]
	})
}));

export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;

export interface DayCard {
	channelId: string;
	channelName: string;
	day: string; // ISO date string (YYYY-MM-DD)
	messageCount: number;
	messages: Message[];
}
