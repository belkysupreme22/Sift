import type { Message, DayCard } from '../db/schema.js';

export interface TimelineGroup {
	id: string;
	title: string;
	subtitle?: string;
	isToday: boolean;
	messages: Array<Message & { channelName: string }>;
}

/**
 * Unicode-aware character truncation safe for multi-byte UTF-8 scripts
 * such as Amharic (Ethiopic / Ge'ez script: ሀ, ሁ, ሂ, ሃ, ሄ, ህ, ሆ, etc.)
 */
export function truncateUtf8(text: string | null | undefined, maxChars = 180, suffix = '...'): string {
	if (!text) return '';
	
	const chars = Array.from(text.trim());
	if (chars.length <= maxChars) {
		return text;
	}
	
	return chars.slice(0, maxChars).join('') + suffix;
}

/**
 * Format relative day header matching the reference design:
 * "Today", "Yesterday", or "Feb 8, 2026"
 */
export function formatTimelineDate(dateStrOrObj: string | Date): {
	label: string;
	isToday: boolean;
	isYesterday: boolean;
	fullDate: string;
} {
	const date = typeof dateStrOrObj === 'string' ? new Date(dateStrOrObj) : dateStrOrObj;
	const now = new Date();

	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

	const diffTime = today.getTime() - target.getTime();
	const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

	const isToday = diffDays === 0;
	const isYesterday = diffDays === 1;

	let label = '';
	if (isToday) {
		label = 'Today';
	} else if (isYesterday) {
		label = 'Yesterday';
	} else {
		// "Feb 8, 2026"
		label = date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	const fullDate = date.toLocaleDateString('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});

	return { label, isToday, isYesterday, fullDate };
}

/**
 * Group messages by Day, Week, or Month matching the video frame layout
 */
export function groupCardsByView(
	cards: DayCard[],
	view: 'day' | 'week' | 'month'
): TimelineGroup[] {
	// 1. Flatten all messages with channel names attached
	const allItems: Array<Message & { channelName: string; rawDay: string }> = [];
	for (const card of cards) {
		for (const msg of card.messages) {
			allItems.push({
				...msg,
				channelName: card.channelName,
				rawDay: card.day
			});
		}
	}

	// Sort globally by posted date descending (newest first)
	allItems.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());

	const now = new Date();
	const groupsMap = new Map<string, TimelineGroup>();

	if (view === 'day') {
		for (const item of allItems) {
			const date = new Date(item.postedAt);
			const dayKey = date.toISOString().split('T')[0];
			const dateInfo = formatTimelineDate(date);

			if (!groupsMap.has(dayKey)) {
				groupsMap.set(dayKey, {
					id: `day_${dayKey}`,
					title: dateInfo.label,
					subtitle: dateInfo.fullDate,
					isToday: dateInfo.isToday,
					messages: [item]
				});
			} else {
				groupsMap.get(dayKey)!.messages.push(item);
			}
		}
		return Array.from(groupsMap.values());
	}

	if (view === 'week') {
		for (const item of allItems) {
			const date = new Date(item.postedAt);
			const firstDayOfWeek = new Date(date);
			const day = date.getDay();
			const diff = date.getDate() - day + (day === 0 ? -6 : 1);
			firstDayOfWeek.setDate(diff);

			const weekKey = firstDayOfWeek.toISOString().split('T')[0];
			const diffWeeks = Math.floor((now.getTime() - firstDayOfWeek.getTime()) / (1000 * 60 * 60 * 24 * 7));

			let weekTitle = '';
			if (diffWeeks === 0) weekTitle = 'This Week';
			else if (diffWeeks === 1) weekTitle = 'Last Week';
			else {
				const endOfWeek = new Date(firstDayOfWeek);
				endOfWeek.setDate(endOfWeek.getDate() + 6);
				weekTitle = `${firstDayOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
			}

			if (!groupsMap.has(weekKey)) {
				groupsMap.set(weekKey, {
					id: `week_${weekKey}`,
					title: weekTitle,
					isToday: diffWeeks === 0,
					messages: [item]
				});
			} else {
				groupsMap.get(weekKey)!.messages.push(item);
			}
		}
		return Array.from(groupsMap.values());
	}

	// Month view
	for (const item of allItems) {
		const date = new Date(item.postedAt);
		const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
		const isCurrentMonth = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
		const monthTitle = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

		if (!groupsMap.has(monthKey)) {
			groupsMap.set(monthKey, {
				id: `month_${monthKey}`,
				title: monthTitle,
				isToday: isCurrentMonth,
				messages: [item]
			});
		} else {
			groupsMap.get(monthKey)!.messages.push(item);
		}
	}

	return Array.from(groupsMap.values());
}

/**
 * Format message post time (e.g. "9:00 AM" or "4:30 PM")
 */
export function formatMessageTime(dateStrOrObj: string | Date): string {
	const date = typeof dateStrOrObj === 'string' ? new Date(dateStrOrObj) : dateStrOrObj;
	return date.toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	});
}

export interface ChannelColorTheme {
	text: string;
	bg: string;
	border: string;
	hex: string;
}

/**
 * Assign tasteful colors to channel names based on message count tier
 */
export function getChannelColor(messageCount: number): ChannelColorTheme {
	if (messageCount >= 100) {
		return {
			text: 'text-[#fb7185]',
			bg: 'bg-[#f43f5e]/10',
			border: 'border-[#f43f5e]/25',
			hex: '#f43f5e'
		};
	}
	if (messageCount >= 60) {
		return {
			text: 'text-[#fb923c]',
			bg: 'bg-[#f97316]/10',
			border: 'border-[#f97316]/25',
			hex: '#f97316'
		};
	}
	if (messageCount >= 30) {
		return {
			text: 'text-[#fbbf24]',
			bg: 'bg-[#f59e0b]/10',
			border: 'border-[#f59e0b]/25',
			hex: '#f59e0b'
		};
	}
	if (messageCount >= 15) {
		return {
			text: 'text-[#34d399]',
			bg: 'bg-[#10b981]/10',
			border: 'border-[#10b981]/25',
			hex: '#10b981'
		};
	}
	return {
		text: 'text-[#38bdf8]',
		bg: 'bg-[#0284c7]/10',
		border: 'border-[#0284c7]/25',
		hex: '#38bdf8'
	};
}

