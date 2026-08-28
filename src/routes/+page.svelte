<script lang="ts">
	import type { PageData } from './$types';
	import { formatTimelineDate, formatMessageTime, truncateUtf8, groupCardsByView, getChannelColor, type TimelineGroup } from '$lib/utils/amharic.js';
	import { onMount } from 'svelte';
	import { 
		SlidersHorizontal, 
		LayoutGrid, 
		BarChart2, 
		Folder, 
		RefreshCw,
		ChevronDown,
		ChevronUp,
		Image as ImageIcon,
		X,
		Copy,
		Check,
		ArrowUpRight,
		Activity,
		Sparkles,
		CalendarDays,
		Plus,
		Search,
		Star,
		Volume2,
		VolumeX,
		Share2,
		Command,
		Keyboard,
		Radio,
		UserCheck,
		ShieldCheck,
		CheckCircle2,
		Compass,
		HelpCircle,
		Lightbulb,
		Layers,
		ArrowLeft,
		ArrowRight,
		LogOut
	} from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	// Core View States
	let timeView = $state<'day' | 'week' | 'month'>('day');
	let activeTab = $state<'timeline' | 'channels' | 'stats' | 'media' | 'starred'>('timeline');
	let selectedChannelFilter = $state<string | null>(null);
	let selectedWeekdays = $state<number[]>([]); // 0=Sun, 1=Mon, ..., 6=Sat
	let searchQuery = $state('');
	let isSearchOpen = $state(false);
	let isAccountModalOpen = $state(false);

	// Interactive Onboarding Tour State
	let isOnboardingOpen = $state(false);
	let onboardingStep = $state(0);
	let spotlightRect = $state<{ top: number; left: number; width: number; height: number } | null>(null);
	let tooltipStyle = $state<{ top: number; left: number; placement: 'bottom' | 'top' | 'right' | 'left' | 'center'; arrowOffset: number }>({
		top: 100,
		left: 100,
		placement: 'bottom',
		arrowOffset: 24
	});

	const onboardingTourSteps = [
		{
			targetSelector: '#tour-time-switcher',
			preferredPlacement: 'bottom' as const,
			tag: 'Time Resolution Switcher',
			title: 'Switch Day, Week & Month Views',
			description: 'Seamlessly zoom between Day, Week, and Month chronological views to inspect your updates at your preferred time granularity.',
			tip: 'Zero AI Loss: Every story is preserved in full unedited text with multi-language script fidelity.',
			badge: 'Step 1 of 5'
		},
		{
			targetSelector: '#tour-weekday-filters',
			preferredPlacement: 'bottom' as const,
			tag: 'Days of the Week Filter',
			title: 'Filter by Specific Days & Presets',
			description: 'Click on individual weekday pills (e.g. Mon, Tue, Fri) or quick presets (Mon-Fri, Sat-Sun) to instantly focus your reading on specific days.',
			tip: 'Active pills highlight in rose and update story counts dynamically.',
			badge: 'Step 2 of 5'
		},
		{
			targetSelector: '#tour-search-btn',
			preferredPlacement: 'bottom' as const,
			tag: 'Instant Fuzzy Search',
			title: 'Search Anything with ⌘K or /',
			description: 'Type ⌘K (Ctrl+K) or / anywhere on your keyboard to instantly filter across all your indexed stories, topics, and channel handles in real-time.',
			tip: 'Search terms are highlighted directly on story snippets as you type.',
			badge: 'Step 3 of 5'
		},
		{
			targetSelector: '#tour-story-item',
			preferredPlacement: 'top' as const,
			tag: 'Interactive Story Utilities',
			title: 'Bookmarks, Sharing & Channel Filters',
			description: 'Every story card includes 1-tap superpowers: star/bookmark (★), share, copy raw text, filter by channel, and upcoming voice narration.',
			tip: 'Channel names are color-coded based on posting volume so high-density channels stand out.',
			badge: 'Step 4 of 5'
		},
		{
			targetSelector: '#tour-dock-nav',
			preferredPlacement: 'right' as const,
			tag: 'Speed Dock Navigation',
			title: 'Dock Views & Keyboard Cheatsheet',
			description: 'Navigate Sift with speed using the left dock: 1 for Timeline, 2 for Channels, 3 for Metrics, 4 for Media Gallery, and 5 for Starred.',
			tip: 'Press ? anytime on your keyboard to view the complete keyboard shortcuts cheatsheet.',
			badge: 'Step 5 of 5'
		}
	];

	function updateSpotlightPosition() {
		if (!isOnboardingOpen || typeof window === 'undefined') return;
		const step = onboardingTourSteps[onboardingStep];
		if (!step?.targetSelector) {
			spotlightRect = null;
			tooltipStyle = {
				top: Math.max(20, (window.innerHeight - 300) / 2),
				left: Math.max(16, (window.innerWidth - 420) / 2),
				placement: 'center',
				arrowOffset: 24
			};
			return;
		}

		let el = document.querySelector(step.targetSelector) as HTMLElement | null;
		if (!el && step.targetSelector === '#tour-story-item') {
			el = document.querySelector('#tour-empty-welcome') as HTMLElement | null;
		}

		if (!el) {
			spotlightRect = null;
			tooltipStyle = {
				top: Math.max(20, (window.innerHeight - 300) / 2),
				left: Math.max(16, (window.innerWidth - 420) / 2),
				placement: 'center',
				arrowOffset: 24
			};
			return;
		}

		el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

		const rect = el.getBoundingClientRect();
		const pad = 6;
		const sRect = {
			top: Math.max(0, rect.top - pad),
			left: Math.max(0, rect.left - pad),
			width: rect.width + pad * 2,
			height: rect.height + pad * 2
		};
		spotlightRect = sRect;

		const cardWidth = Math.min(420, window.innerWidth - 32);
		const cardEstimatedHeight = 280;

		let top = 0;
		let left = 0;
		let placement: 'bottom' | 'top' | 'right' | 'left' | 'center' = 'bottom';
		let arrowOffset = 24;

		if (step.preferredPlacement === 'right' && sRect.left + sRect.width + cardWidth + 24 < window.innerWidth) {
			placement = 'right';
			left = sRect.left + sRect.width + 16;
			top = Math.max(16, Math.min(window.innerHeight - cardEstimatedHeight - 16, sRect.top));
			arrowOffset = Math.max(16, Math.min(cardEstimatedHeight - 32, sRect.top - top + 20));
		} else if (sRect.top + sRect.height + cardEstimatedHeight + 24 < window.innerHeight) {
			placement = 'bottom';
			top = sRect.top + sRect.height + 14;
			left = Math.max(16, Math.min(window.innerWidth - cardWidth - 16, sRect.left + (sRect.width / 2) - (cardWidth / 2)));
			arrowOffset = Math.max(20, Math.min(cardWidth - 32, sRect.left + (sRect.width / 2) - left));
		} else if (sRect.top - cardEstimatedHeight - 24 > 0) {
			placement = 'top';
			top = sRect.top - cardEstimatedHeight - 14;
			left = Math.max(16, Math.min(window.innerWidth - cardWidth - 16, sRect.left + (sRect.width / 2) - (cardWidth / 2)));
			arrowOffset = Math.max(20, Math.min(cardWidth - 32, sRect.left + (sRect.width / 2) - left));
		} else {
			placement = 'center';
			top = Math.max(16, (window.innerHeight - cardEstimatedHeight) / 2);
			left = Math.max(16, (window.innerWidth - cardWidth) / 2);
			arrowOffset = 24;
		}

		tooltipStyle = { top, left, placement, arrowOffset };
	}

	function finishOnboarding() {
		isOnboardingOpen = false;
		spotlightRect = null;
		try {
			localStorage.setItem('sift_onboarding_completed', 'true');
		} catch (_) {}
	}

	function startOnboardingTour() {
		onboardingStep = 0;
		isOnboardingOpen = true;
		if (isShortcutsModalOpen) isShortcutsModalOpen = false;
	}

	$effect(() => {
		if (isOnboardingOpen) {
			// Trigger spotlight update when step changes
			const _step = onboardingStep;
			const timer = setTimeout(() => {
				updateSpotlightPosition();
			}, 60);

			const handleResize = () => updateSpotlightPosition();
			window.addEventListener('resize', handleResize);
			window.addEventListener('scroll', handleResize, true);

			return () => {
				clearTimeout(timer);
				window.removeEventListener('resize', handleResize);
				window.removeEventListener('scroll', handleResize, true);
			};
		} else {
			spotlightRect = null;
		}
	});

	// Interactive Bookmark / Star System
	let starredIds = $state<Set<string>>(new Set());

	// Interactive Text-to-Speech State
	let playingSpeechId = $state<string | null>(null);

	// Navigation & UI States
	let expandedMessages = $state<Record<string, boolean>>({});
	let expandedGroupLimits = $state<Record<string, number>>({});
	let visibleGroupsCount = $state(6);
	let visibleChannelsCount = $state(8);
	let copiedId = $state<string | null>(null);
	let isSyncing = $state(false);
	let syncFeedback = $state('');
	let isShortcutsModalOpen = $state(false);
	let focusedStoryIndex = $state<number | null>(null);

	// AI Summary Modal state
	let selectedStory = $state<{
		id: string;
		channelName: string;
		text: string;
		postedAt: Date;
		hasMedia: boolean;
	} | null>(null);

	const weekdaysList = [
		{ label: 'Monday', short: 'Mon', day: 1 },
		{ label: 'Tuesday', short: 'Tue', day: 2 },
		{ label: 'Wednesday', short: 'Wed', day: 3 },
		{ label: 'Thursday', short: 'Thu', day: 4 },
		{ label: 'Friday', short: 'Fri', day: 5 },
		{ label: 'Saturday', short: 'Sat', day: 6 },
		{ label: 'Sunday', short: 'Sun', day: 0 }
	];

	let isLoggingOut = $state(false);

	async function handleLogout(redirectToLogin = false) {
		if (isLoggingOut) return;
		isLoggingOut = true;
		triggerHaptic();
		try {
			await fetch('/api/auth/logout', { method: 'POST' });
			try {
				localStorage.removeItem('sift_starred_stories');
			} catch (_) {}

			if (redirectToLogin) {
				window.location.href = '/login';
			} else {
				window.location.href = '/';
			}
		} catch (err) {
			console.error('[Logout Error]', err);
			window.location.href = '/login';
		} finally {
			isLoggingOut = false;
		}
	}

	onMount(() => {
		// Auto-open onboarding tour for first-time visitors
		try {
			const completed = localStorage.getItem('sift_onboarding_completed');
			if (!completed) {
				setTimeout(() => {
					isOnboardingOpen = true;
				}, 600);
			}
		} catch (_) {}

		// Load persisted bookmarks from localStorage
		try {
			const saved = localStorage.getItem('sift_starred_stories');
			if (saved) {
				starredIds = new Set(JSON.parse(saved));
			}
		} catch (_) {}

		// Keyboard Shortcuts Listener
		function handleKeyDown(e: KeyboardEvent) {
			// Don't capture when typing in an input
			if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
				if (e.key === 'Escape') {
					searchQuery = '';
					isSearchOpen = false;
					(e.target as HTMLElement).blur();
				}
				return;
			}

			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				isSearchOpen = !isSearchOpen;
				if (isSearchOpen) {
					setTimeout(() => document.getElementById('sift-search-input')?.focus(), 50);
				}
				return;
			}

			if (e.key === '/') {
				e.preventDefault();
				isSearchOpen = true;
				setTimeout(() => document.getElementById('sift-search-input')?.focus(), 50);
				return;
			}

			if (e.key === '?') {
				e.preventDefault();
				isShortcutsModalOpen = !isShortcutsModalOpen;
				return;
			}

			if (e.key === 'Escape') {
				if (isOnboardingOpen) finishOnboarding();
				if (isAccountModalOpen) isAccountModalOpen = false;
				if (isShortcutsModalOpen) isShortcutsModalOpen = false;
				if (selectedStory) selectedStory = null;
				if (isSearchOpen) isSearchOpen = false;
				return;
			}

			// Tab switching shortcuts (1, 2, 3, 4, 5)
			if (e.key === '1') { activeTab = 'timeline'; triggerHaptic(); }
			if (e.key === '2') { activeTab = 'channels'; triggerHaptic(); }
			if (e.key === '3') { activeTab = 'stats'; triggerHaptic(); }
			if (e.key === '4') { activeTab = 'media'; triggerHaptic(); }
			if (e.key === '5') { activeTab = 'starred'; triggerHaptic(); }

			// Time view switching (d, w, m)
			if (e.key === 'd') { switchTimeView('day'); }
			if (e.key === 'w') { switchTimeView('week'); }
			if (e.key === 'm') { switchTimeView('month'); }
		}

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			if (typeof window !== 'undefined' && window.speechSynthesis) {
				window.speechSynthesis.cancel();
			}
		};
	});

	function toggleStar(e: MouseEvent, storyId: string) {
		e.stopPropagation();
		const next = new Set(starredIds);
		if (next.has(storyId)) {
			next.delete(storyId);
		} else {
			next.add(storyId);
		}
		starredIds = next;
		try {
			localStorage.setItem('sift_starred_stories', JSON.stringify(Array.from(next)));
		} catch (_) {}
		triggerHaptic();
	}

	let ttsComingSoonId = $state<string | null>(null);

	function speakStory(e: MouseEvent, storyId: string, _text: string) {
		e.stopPropagation();
		ttsComingSoonId = storyId;
		triggerHaptic();
		setTimeout(() => {
			if (ttsComingSoonId === storyId) ttsComingSoonId = null;
		}, 1800);
	}

	function shareStory(e: MouseEvent, msg: { text: string | null; postedAt: Date }, channelName: string) {
		e.stopPropagation();
		const timeStr = formatMessageTime(msg.postedAt);
		const dateStr = new Date(msg.postedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		const shareText = `📢 ${channelName} • ${dateStr} at ${timeStr}\n\n${msg.text || '[Media update]'}\n\nvia Sift Timeline`;
		
		if (navigator.share) {
			navigator.share({
				title: `${channelName} Story`,
				text: shareText
			}).catch(() => {});
		} else {
			navigator.clipboard.writeText(shareText);
			copiedId = msg.text ? 'share_' + msg.text.slice(0, 8) : 'share';
			setTimeout(() => { copiedId = null; }, 1500);
		}
		triggerHaptic();
	}

	function selectChannel(channelId: string | null) {
		selectedChannelFilter = channelId;
		activeTab = 'timeline';
		visibleGroupsCount = 6;
		triggerHaptic();
	}

	function toggleWeekday(day: number) {
		if (selectedWeekdays.includes(day)) {
			selectedWeekdays = selectedWeekdays.filter((d) => d !== day);
		} else {
			selectedWeekdays = [...selectedWeekdays, day];
		}
		visibleGroupsCount = 6;
		triggerHaptic();
	}

	function setWeekdayPreset(preset: 'all' | 'weekdays' | 'weekends') {
		if (preset === 'all') {
			selectedWeekdays = [];
		} else if (preset === 'weekdays') {
			selectedWeekdays = [1, 2, 3, 4, 5];
		} else if (preset === 'weekends') {
			selectedWeekdays = [6, 0];
		}
		visibleGroupsCount = 6;
		triggerHaptic();
	}

	function clearAllFilters() {
		selectedChannelFilter = null;
		selectedWeekdays = [];
		searchQuery = '';
		visibleGroupsCount = 6;
		triggerHaptic();
	}

	function switchTimeView(view: 'day' | 'week' | 'month') {
		timeView = view;
		visibleGroupsCount = 6;
		triggerHaptic();
	}

	function openSummary(msg: { id: string; channelId: string; telegramMessageId: number; postedAt: Date; text: string | null; hasMedia: boolean | null }, channelName: string) {
		selectedStory = {
			id: msg.id,
			channelName,
			text: msg.text || '',
			postedAt: msg.postedAt,
			hasMedia: Boolean(msg.hasMedia)
		};
		triggerHaptic();
	}

	function closeSummary() {
		selectedStory = null;
		triggerHaptic();
	}

	function toggleExpand(e: MouseEvent, msgId: string) {
		e.stopPropagation();
		expandedMessages[msgId] = !expandedMessages[msgId];
		triggerHaptic();
	}

	function showMoreInGroup(groupId: string, total: number) {
		const current = expandedGroupLimits[groupId] || 8;
		expandedGroupLimits[groupId] = current + 15;
		triggerHaptic();
	}

	function copyText(e: MouseEvent, id: string, text: string) {
		e.stopPropagation();
		navigator.clipboard.writeText(text);
		copiedId = id;
		triggerHaptic();
		setTimeout(() => {
			if (copiedId === id) copiedId = null;
		}, 1500);
	}

	function triggerHaptic() {
		if (typeof window !== 'undefined' && window.Telegram?.WebApp?.HapticFeedback) {
			window.Telegram.WebApp.HapticFeedback.selectionChanged();
		}
	}

	async function handleSync() {
		if (isSyncing) return;
		isSyncing = true;
		syncFeedback = 'Syncing...';
		triggerHaptic();

		try {
			const res = await fetch('/api/sync', { method: 'POST' });
			const result = await res.json();
			if (!res.ok) {
				throw new Error(result.error || 'Sync failed');
			}
			syncFeedback = `Synced ${result.syncedChannelsCount} channels`;
			setTimeout(() => {
				window.location.reload();
			}, 800);
		} catch (err: any) {
			syncFeedback = `Sync error: ${err.message}`;
		} finally {
			isSyncing = false;
		}
	}

	// Message count per weekday for the day picker badges
	let weekdayCounts = $derived.by(() => {
		const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
		for (const card of data.dayCards || []) {
			for (const msg of card.messages) {
				const day = new Date(msg.postedAt).getDay();
				counts[day] = (counts[day] || 0) + 1;
			}
		}
		return counts;
	});

	// Message count per channel for color coding
	let channelCounts = $derived.by(() => {
		const map: Record<string, number> = {};
		for (const card of data.dayCards || []) {
			map[card.channelId] = (map[card.channelId] || 0) + card.messageCount;
			map[card.channelName] = (map[card.channelName] || 0) + card.messageCount;
		}
		return map;
	});

	// Dynamic cards for timeline view filtered by Channel, Weekday, Search Query, and Starred tab
	let allGroups = $derived.by(() => {
		let cards = data.dayCards || [];
		
		// 1. Channel filter
		if (selectedChannelFilter) {
			cards = cards.filter((c) => c.channelId === selectedChannelFilter);
		}

		// 2. Multi Weekday filter (0=Sun, 1=Mon, ..., 6=Sat)
		if (selectedWeekdays.length > 0) {
			cards = cards.map((c) => ({
				...c,
				messages: c.messages.filter((m) => selectedWeekdays.includes(new Date(m.postedAt).getDay()))
			})).filter((c) => c.messages.length > 0);
		}

		// 3. Search query filter
		const q = searchQuery.trim().toLowerCase();
		if (q) {
			cards = cards.map((c) => ({
				...c,
				messages: c.messages.filter((m) => 
					(m.text || '').toLowerCase().includes(q) ||
					c.channelName.toLowerCase().includes(q)
				)
			})).filter((c) => c.messages.length > 0);
		}

		// 4. Starred tab filter
		if (activeTab === 'starred') {
			cards = cards.map((c) => ({
				...c,
				messages: c.messages.filter((m) => starredIds.has(m.id))
			})).filter((c) => c.messages.length > 0);
		}

		return groupCardsByView(cards, timeView);
	});

	let visibleGroups = $derived.by(() => {
		return allGroups.slice(0, visibleGroupsCount);
	});

	let visibleChannels = $derived.by(() => {
		return (data.channels || []).slice(0, visibleChannelsCount);
	});

	// Media-only items for media view
	let mediaItems = $derived.by(() => {
		const items: Array<{ channelName: string; text: string; postedAt: Date; id: string; rawMsg: any }> = [];
		let cards = data.dayCards || [];
		if (selectedChannelFilter) {
			cards = cards.filter((c) => c.channelId === selectedChannelFilter);
		}
		const q = searchQuery.trim().toLowerCase();
		for (const card of cards) {
			for (const msg of card.messages) {
				if (msg.hasMedia) {
					if (selectedWeekdays.length > 0 && !selectedWeekdays.includes(new Date(msg.postedAt).getDay())) {
						continue;
					}
					if (q && !(msg.text || '').toLowerCase().includes(q) && !card.channelName.toLowerCase().includes(q)) {
						continue;
					}
					items.push({
						channelName: card.channelName,
						text: msg.text || '',
						postedAt: msg.postedAt,
						id: msg.id,
						rawMsg: msg
					});
				}
			}
		}
		return items.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
	});

	let selectedChannelName = $derived.by(() => {
		if (!selectedChannelFilter) return null;
		return data.channels.find((c) => c.id === selectedChannelFilter)?.name || 'Filtered Channel';
	});

	let selectedWeekdaysText = $derived.by(() => {
		if (selectedWeekdays.length === 0) return null;
		if (selectedWeekdays.length === 5 && [1, 2, 3, 4, 5].every((d) => selectedWeekdays.includes(d))) {
			return 'Weekdays (Mon-Fri)';
		}
		if (selectedWeekdays.length === 2 && [6, 0].every((d) => selectedWeekdays.includes(d))) {
			return 'Weekends (Sat-Sun)';
		}
		return selectedWeekdays.map((d) => weekdaysList.find((w) => w.day === d)?.short).join(', ');
	});

	let totalStoriesCount = $derived.by(() => {
		return allGroups.reduce((acc, g) => acc + g.messages.length, 0);
	});
</script>

<svelte:head>
	<style>
		@keyframes pulseGlow {
			0%, 100% {
				opacity: 0.9;
				filter: drop-shadow(0 0 6px rgba(244, 63, 94, 0.7));
			}
			50% {
				opacity: 1;
				filter: drop-shadow(0 0 12px rgba(244, 63, 94, 1));
			}
		}

		@keyframes stringLightTravel {
			0% {
				stroke-dashoffset: 80;
			}
			100% {
				stroke-dashoffset: 0;
			}
		}

		@keyframes soundWave {
			0%, 100% {
				height: 4px;
			}
			50% {
				height: 14px;
			}
		}

		.glowing-string {
			stroke-dasharray: 6 4;
			animation: stringLightTravel 2.5s linear infinite;
		}

		.node-light {
			animation: pulseGlow 2s ease-in-out infinite;
		}

		.wave-bar-1 { animation: soundWave 0.8s ease-in-out infinite; }
		.wave-bar-2 { animation: soundWave 0.8s ease-in-out infinite 0.2s; }
		.wave-bar-3 { animation: soundWave 0.8s ease-in-out infinite 0.4s; }
	</style>
</svelte:head>

<div class="flex h-screen w-full bg-[#0d0d0d] text-[#e0e0e0] overflow-hidden font-['Lexend',sans-serif]">
	<!-- Left Minimal Dock -->
	<aside id="tour-dock-nav" class="w-14 sm:w-16 border-r border-[#1a1a1a] bg-[#0d0d0d] flex flex-col items-center py-4 justify-between shrink-0 select-none z-30">
		<div class="flex flex-col items-center gap-6">
			<!-- App Logo -->
			<button
				type="button"
				onclick={clearAllFilters}
				class="w-9 h-9 rounded-xl flex items-center justify-center text-[#777777] hover:text-white transition-colors cursor-pointer"
				title="Sift Home (Reset Filters)"
			>
				<div class="w-5 h-5 rounded-md border border-[#3a3a3a] flex items-center justify-center">
					<div class="w-2 h-2 rounded-sm bg-[#555555]"></div>
				</div>
			</button>

			<!-- 5 Dedicated View Tabs -->
			<nav class="flex flex-col items-center gap-3">
				<!-- 1. Timeline Stream -->
				<button
					type="button"
					onclick={() => { activeTab = 'timeline'; triggerHaptic(); }}
					title="Timeline Stream (Key: 1)"
					class="w-10 h-10 rounded-xl {activeTab === 'timeline' ? 'bg-[#222222] border border-[#2d2d2d] text-white shadow-md' : 'text-[#777777] hover:text-[#cccccc] hover:bg-[#171717]'} flex items-center justify-center transition-all cursor-pointer relative"
				>
					<SlidersHorizontal class="w-4 h-4" />
				</button>

				<!-- 2. Channels Directory -->
				<button
					type="button"
					onclick={() => { activeTab = 'channels'; triggerHaptic(); }}
					title="Subscribed Channels (Key: 2)"
					class="w-10 h-10 rounded-xl {activeTab === 'channels' ? 'bg-[#222222] border border-[#2d2d2d] text-white shadow-md' : 'text-[#777777] hover:text-[#cccccc] hover:bg-[#171717]'} flex items-center justify-center transition-all cursor-pointer"
				>
					<LayoutGrid class="w-4 h-4" />
				</button>

				<!-- 3. Starred / Bookmarked Stories -->
				<button
					type="button"
					onclick={() => { activeTab = 'starred'; triggerHaptic(); }}
					title="Starred Stories (Key: 5)"
					class="w-10 h-10 rounded-xl {activeTab === 'starred' ? 'bg-[#222222] border border-[#2d2d2d] text-[#fbbf24] shadow-md' : 'text-[#777777] hover:text-[#cccccc] hover:bg-[#171717]'} flex items-center justify-center transition-all cursor-pointer relative"
				>
					<Star class="w-4 h-4 {starredIds.size > 0 ? 'fill-[#fbbf24]' : ''}" />
					{#if starredIds.size > 0}
						<span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#fbbf24]"></span>
					{/if}
				</button>

				<!-- 4. Stats & Cadence -->
				<button
					type="button"
					onclick={() => { activeTab = 'stats'; triggerHaptic(); }}
					title="Activity Metrics (Key: 3)"
					class="w-10 h-10 rounded-xl {activeTab === 'stats' ? 'bg-[#222222] border border-[#2d2d2d] text-white shadow-md' : 'text-[#777777] hover:text-[#cccccc] hover:bg-[#171717]'} flex items-center justify-center transition-all cursor-pointer"
				>
					<BarChart2 class="w-4 h-4" />
				</button>

				<!-- 5. Media Gallery -->
				<button
					type="button"
					onclick={() => { activeTab = 'media'; triggerHaptic(); }}
					title="Media Gallery (Key: 4)"
					class="w-10 h-10 rounded-xl {activeTab === 'media' ? 'bg-[#222222] border border-[#2d2d2d] text-[#f43f5e] shadow-md' : 'text-[#777777] hover:text-[#cccccc] hover:bg-[#171717]'} flex items-center justify-center transition-all cursor-pointer"
				>
					<Folder class="w-4 h-4" />
				</button>
			</nav>
		</div>

		<!-- Bottom Utilities: Keyboard Shortcuts Cheatsheet -->
		<div class="flex flex-col items-center pb-2">
			<!-- Keyboard Shortcuts Cheatsheet Trigger -->
			<button
				type="button"
				onclick={() => { isShortcutsModalOpen = true; triggerHaptic(); }}
				title="Keyboard Shortcuts (Key: ?)"
				class="w-9 h-9 rounded-xl text-[#666666] hover:text-white hover:bg-[#181818] flex items-center justify-center transition-colors cursor-pointer text-xs font-mono"
			>
				<Keyboard class="w-4 h-4" />
			</button>
		</div>
	</aside>

	<!-- Main Container -->
	<main class="flex-1 flex flex-col h-full overflow-y-auto relative">
		<!-- Top Interactive Bar -->
		<header class="sticky top-0 z-20 bg-[#0d0d0d]/95 backdrop-blur border-b border-[#1a1a1a] px-4 sm:px-6 py-3 flex flex-col gap-2.5">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3 min-w-0">
					<h1 class="text-base sm:text-lg font-semibold text-white tracking-tight shrink-0 flex items-center gap-2">
						{#if activeTab === 'timeline'}
							<span>Sift</span>
							<span class="text-xs font-normal text-[#666666] font-mono">({totalStoriesCount})</span>
						{:else if activeTab === 'channels'}
							<span>Channels</span>
							<span class="text-xs font-normal text-[#666666] font-mono">({data.channels.length})</span>
						{:else if activeTab === 'starred'}
							<span>Starred Stories</span>
							<span class="text-xs font-normal text-[#fbbf24] font-mono">({starredIds.size})</span>
						{:else if activeTab === 'stats'}
							<span>Metrics</span>
						{:else if activeTab === 'media'}
							<span>Media</span>
							<span class="text-xs font-normal text-[#666666] font-mono">({mediaItems.length})</span>
						{/if}
					</h1>

					<!-- Filter Active Badges -->
					<div class="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
						{#if selectedChannelName}
							<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1c1c1c] border border-[#2d2d2d] text-xs text-[#cccccc] shrink-0">
								<span class="truncate max-w-[120px] sm:max-w-[160px]">{selectedChannelName}</span>
								<button
									type="button"
									onclick={() => selectChannel(null)}
									class="text-[#777777] hover:text-white ml-0.5 cursor-pointer"
								>
									<X class="w-3.5 h-3.5" />
								</button>
							</div>
						{/if}

						{#if selectedWeekdaysText}
							<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1c1c1c] border border-[#f43f5e]/40 text-xs text-[#f43f5e] shrink-0">
								<span>Days: {selectedWeekdaysText}</span>
								<button
									type="button"
									onclick={() => selectedWeekdays = []}
									class="text-[#aaaaaa] hover:text-white ml-0.5 cursor-pointer"
								>
									<X class="w-3.5 h-3.5" />
								</button>
							</div>
						{/if}

						{#if searchQuery}
							<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1c1c1c] border border-[#38bdf8]/40 text-xs text-[#38bdf8] shrink-0">
								<span>Search: "{searchQuery}"</span>
								<button
									type="button"
									onclick={() => searchQuery = ''}
									class="text-[#aaaaaa] hover:text-white ml-0.5 cursor-pointer"
								>
									<X class="w-3.5 h-3.5" />
								</button>
							</div>
						{/if}

						{#if selectedChannelFilter || selectedWeekdays.length > 0 || searchQuery}
							<button
								type="button"
								onclick={clearAllFilters}
								class="text-[11px] text-[#777777] hover:text-white underline cursor-pointer shrink-0 ml-1"
							>
								Clear All
							</button>
						{/if}
					</div>
				</div>

				<!-- Right Controls: Tour + Instant Search Button + View Switcher -->
				<div class="flex items-center gap-2 sm:gap-3">
					<!-- Interactive App Tour Trigger -->
					<button
						type="button"
						onclick={startOnboardingTour}
						class="px-2.5 py-1.5 rounded-xl bg-[#141414] hover:bg-[#1f1f1f] border border-[#262626] text-xs text-[#888888] hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
						title="Take Interactive App Tour"
					>
						<Compass class="w-3.5 h-3.5 text-[#fb7185]" />
						<span class="hidden lg:inline">Tour</span>
					</button>

					<!-- Interactive Instant Search Trigger -->
					<button
						id="tour-search-btn"
						type="button"
						onclick={() => { isSearchOpen = !isSearchOpen; if (isSearchOpen) setTimeout(() => document.getElementById('sift-search-input')?.focus(), 50); }}
						class="px-2.5 py-1.5 rounded-xl bg-[#141414] hover:bg-[#1f1f1f] border border-[#262626] text-xs text-[#888888] hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
						title="Quick Search (Ctrl+K or /)"
					>
						<Search class="w-3.5 h-3.5 text-[#f43f5e]" />
						<span class="hidden md:inline">Search</span>
						<kbd class="hidden md:inline text-[10px] bg-[#1e1e1e] border border-[#333333] px-1 py-0.5 rounded text-[#777777]">⌘K</kbd>
					</button>

					{#if activeTab === 'timeline' || activeTab === 'starred'}
						<div id="tour-time-switcher" class="bg-[#151515] border border-[#222222] p-0.5 rounded-xl flex items-center text-xs font-medium text-[#777777]">
							<button
								type="button"
								onclick={() => switchTimeView('day')}
								class="px-2.5 sm:px-3.5 py-1 rounded-lg transition-all cursor-pointer {timeView === 'day' ? 'bg-[#262626] text-white font-semibold shadow-sm' : 'hover:text-[#bbbbbb]'}"
								title="Day View (Key: d)"
							>
								Day
							</button>
							<button
								type="button"
								onclick={() => switchTimeView('week')}
								class="px-2.5 sm:px-3.5 py-1 rounded-lg transition-all cursor-pointer {timeView === 'week' ? 'bg-[#262626] text-white font-semibold shadow-sm' : 'hover:text-[#bbbbbb]'}"
								title="Week View (Key: w)"
							>
								Week
							</button>
							<button
								type="button"
								onclick={() => switchTimeView('month')}
								class="px-2.5 sm:px-3.5 py-1 rounded-lg transition-all cursor-pointer {timeView === 'month' ? 'bg-[#262626] text-white font-semibold shadow-sm' : 'hover:text-[#bbbbbb]'}"
								title="Month View (Key: m)"
							>
								Month
							</button>
						</div>
					{/if}

					{#if data.isLoggedIn}
						<!-- Account Status Pill -->
						<button
							type="button"
							onclick={() => { isAccountModalOpen = true; triggerHaptic(); }}
							class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#141414] hover:bg-[#1c1c1c] border border-[#252525] hover:border-[#383838] text-xs text-[#cccccc] transition-all cursor-pointer shadow-sm"
							title="Account Status: Active MTProto Session"
						>
							<div class="relative flex items-center justify-center">
								<div class="w-2 h-2 rounded-full bg-emerald-500"></div>
								<div class="absolute w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-75"></div>
							</div>
							<span class="hidden md:inline font-medium text-white">Active</span>
						</button>

						<button
							type="button"
							onclick={handleSync}
							disabled={isSyncing}
							class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#1c1c1c] hover:bg-[#252525] border border-[#2c2c2c] text-white transition-all cursor-pointer disabled:opacity-50"
						>
							<RefreshCw class="w-3.5 h-3.5 {isSyncing ? 'animate-spin' : ''}" />
							<span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
						</button>
					{:else}
						<a
							href="/login"
							class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#f43f5e] hover:bg-[#e11d48] text-white transition-all shadow-md shadow-[#f43f5e]/20"
						>
							<span class="w-1.5 h-1.5 rounded-full bg-white"></span>
							<span>Connect Account</span>
						</a>
					{/if}
				</div>
			</div>

			<!-- Collapsible Live Search Bar -->
			{#if isSearchOpen}
				<div class="relative w-full pt-1 animate-in fade-in slide-in-from-top-1 duration-150">
					<div class="relative flex items-center">
						<Search class="absolute left-3.5 w-3.5 h-3.5 text-[#777777]" />
						<input
							id="sift-search-input"
							type="text"
							bind:value={searchQuery}
							placeholder="Search through messages, stories, or channel names in realtime..."
							class="w-full bg-[#141414] border border-[#282828] focus:border-[#f43f5e] text-xs text-white placeholder-[#555555] rounded-xl pl-9 pr-8 py-2 outline-none transition-colors"
						/>
						{#if searchQuery}
							<button
								type="button"
								onclick={() => searchQuery = ''}
								class="absolute right-3 text-[#777777] hover:text-white cursor-pointer"
							>
								<X class="w-3.5 h-3.5" />
							</button>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Clean Days of the Week Filter Bar (In Timeline & Starred view) -->
			{#if activeTab === 'timeline' || activeTab === 'starred'}
				<div id="tour-weekday-filters" class="flex items-center justify-between gap-2 overflow-x-auto scrollbar-none pt-1 border-t border-[#1a1a1a]">
					<div class="flex items-center gap-1 shrink-0">
						<span class="text-[11px] text-[#666666] font-medium mr-1 flex items-center gap-1">
							<CalendarDays class="w-3.5 h-3.5 text-[#f43f5e]" />
							Days:
						</span>

						<!-- All Days Preset -->
						<button
							type="button"
							onclick={() => setWeekdayPreset('all')}
							class="px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer {selectedWeekdays.length === 0 ? 'bg-[#262626] text-white font-semibold shadow-sm' : 'bg-[#141414] text-[#777777] hover:text-white border border-[#222222]'}"
						>
							All
						</button>

						<!-- Individual Days of the Week (Mon - Sun) -->
						{#each weekdaysList as wd}
							{@const isSelected = selectedWeekdays.includes(wd.day)}
							{@const count = weekdayCounts[wd.day] || 0}

							<button
								type="button"
								onclick={() => toggleWeekday(wd.day)}
								class="px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 {isSelected ? 'bg-[#f43f5e] text-white font-semibold shadow-md shadow-[#f43f5e]/20' : 'bg-[#141414] text-[#888888] hover:text-white border border-[#222222]'}"
								title="{wd.label} ({count} stories)"
							>
								<span>{wd.short}</span>
								{#if count > 0}
									<span class="text-[10px] opacity-75 font-mono">({count})</span>
								{/if}
							</button>
						{/each}
					</div>

					<!-- Quick Day Presets -->
					<div class="hidden sm:flex items-center gap-1 shrink-0">
						<button
							type="button"
							onclick={() => setWeekdayPreset('weekdays')}
							class="px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#888888] hover:text-white bg-[#141414] border border-[#222222] cursor-pointer transition-colors"
						>
							Mon-Fri
						</button>
						<button
							type="button"
							onclick={() => setWeekdayPreset('weekends')}
							class="px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#888888] hover:text-white bg-[#141414] border border-[#222222] cursor-pointer transition-colors"
						>
							Sat-Sun
						</button>
					</div>
				</div>
			{/if}
		</header>

		{#if syncFeedback}
			<div class="bg-[#141414] border-b border-[#222222] px-6 py-2 text-xs text-[#a0a0a0] flex items-center justify-between">
				<span>{syncFeedback}</span>
			</div>
		{/if}

		<!-- View Content Sections -->
		<div class="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
			<!-- 1. TIMELINE STREAM & STARRED STREAM WITH GLOWING ZIGZAG STRINGS -->
			{#if activeTab === 'timeline' || activeTab === 'starred'}
				{#if isSyncing}
					<!-- Animated Skeleton Loader -->
					<div class="relative flex flex-col pl-4 sm:pl-6 animate-pulse">
						{#each [1, 2, 3] as _day}
							<div class="relative flex flex-col pb-8">
								<div class="flex items-center gap-3 mb-3">
									<div class="w-2.5 h-2.5 rounded-full bg-[#2c2c2c] -ml-1"></div>
									<div class="h-4 w-28 bg-[#222222] rounded-md"></div>
								</div>
								<div class="flex flex-col ml-5 gap-2.5">
									{#each [1, 2, 3] as _msg}
										<div class="flex items-start gap-3 px-3 py-2">
											<div class="w-1.5 h-1.5 rounded-full bg-[#2a2a2a] mt-1.5"></div>
											<div class="flex-1 flex flex-col gap-2">
												<div class="h-3 w-16 bg-[#1a1a1a] rounded"></div>
												<div class="h-3.5 w-full bg-[#1e1e1e] rounded"></div>
												<div class="h-3.5 w-3/4 bg-[#181818] rounded"></div>
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				{:else if allGroups.length === 0}
					<div id="tour-empty-welcome" class="w-full max-w-lg mx-auto bg-[#141414] border border-[#222222] rounded-3xl p-8 flex flex-col gap-6 text-center my-8">
						<div class="w-12 h-12 rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] flex items-center justify-center mx-auto text-[#f43f5e]">
							{#if activeTab === 'starred'}
								<Star class="w-6 h-6 text-[#fbbf24]" />
							{:else}
								<SlidersHorizontal class="w-6 h-6" />
							{/if}
						</div>
						<div class="flex flex-col gap-1.5">
							<h2 class="text-base font-semibold text-white">
								{#if activeTab === 'starred'}
									No Starred Stories Yet
								{:else if selectedChannelFilter || selectedWeekdays.length > 0 || searchQuery}
									No Matching Stories Found
								{:else}
									Welcome to Sift
								{/if}
							</h2>
							<p class="text-xs text-[#888888] leading-relaxed">
								{#if activeTab === 'starred'}
									Click the star icon (★) on any story in your timeline to bookmark it here for quick access.
								{:else if selectedChannelFilter || selectedWeekdays.length > 0 || searchQuery}
									Try adjusting your search query, selecting different days of the week, or clearing filters.
								{:else}
									Your chronological channel timeline with glowing story strings.
								{/if}
							</p>
						</div>
						{#if selectedChannelFilter || selectedWeekdays.length > 0 || searchQuery}
							<button
								type="button"
								onclick={clearAllFilters}
								class="px-4 py-2.5 rounded-xl bg-[#1f1f1f] hover:bg-[#282828] text-xs font-medium text-white transition-all self-center cursor-pointer"
							>
								Clear All Filters
							</button>
						{:else if activeTab === 'starred'}
							<button
								type="button"
								onclick={() => activeTab = 'timeline'}
								class="px-4 py-2.5 rounded-xl bg-[#f43f5e] hover:bg-[#e11d48] text-xs font-semibold text-white transition-all self-center cursor-pointer"
							>
								Back to Timeline
							</button>
						{:else if data.isLoggedIn}
							<button
								type="button"
								onclick={handleSync}
								disabled={isSyncing}
								class="w-full bg-[#f43f5e] hover:bg-[#e11d48] disabled:opacity-50 text-white rounded-xl py-3 text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#f43f5e]/20 cursor-pointer"
							>
								<RefreshCw class="w-3.5 h-3.5 {isSyncing ? 'animate-spin' : ''}" />
								<span>{isSyncing ? 'Syncing...' : 'Sync Channels Now'}</span>
							</button>
						{:else}
							<a
								href="/login"
								class="w-full bg-[#f43f5e] hover:bg-[#e11d48] text-white rounded-xl py-3 text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#f43f5e]/20"
							>
								Connect Telegram Account
							</a>
						{/if}
					</div>
				{:else}
					<div class="relative flex flex-col pl-4 sm:pl-6">
						{#each visibleGroups as group, groupIndex (group.id)}
							{@const isLastGroup = groupIndex === visibleGroups.length - 1}
							{@const maxMsgLimit = expandedGroupLimits[group.id] || 8}
							{@const visibleMessages = group.messages.slice(0, maxMsgLimit)}
							{@const hasMoreInGroup = group.messages.length > maxMsgLimit}

							<div class="relative flex flex-col pb-8 last:pb-2">
								<!-- Smooth Organic Zigzag Line -->
								{#if !isLastGroup}
									<div class="absolute left-0 top-3 bottom-0 w-8 pointer-events-none -ml-2 overflow-visible">
										<svg class="w-full h-full" viewBox="0 0 24 100" preserveAspectRatio="none" fill="none">
											<path
												d="M 12 0 C 15 15, 9 30, 12 45 C 15 60, 9 75, 12 90 C 15 95, 10 98, 12 100"
												stroke="{group.isToday ? '#f43f5e' : '#2a2a2a'}"
												stroke-width="{group.isToday ? '1.5' : '1'}"
												stroke-opacity="{group.isToday ? '0.8' : '0.6'}"
												fill="none"
												class="{group.isToday ? 'glowing-string' : ''}"
											/>
										</svg>
									</div>
								{/if}

								<!-- Date Node Header -->
								<div class="flex items-center gap-3 mb-2.5 group">
									<div class="relative z-10 w-4 h-4 flex items-center justify-center -ml-2 bg-[#0d0d0d]">
										{#if group.isToday}
											<div class="w-2.5 h-2.5 rounded-full bg-[#f43f5e] node-light shadow-[0_0_12px_#f43f5e]"></div>
										{:else}
											<div class="w-2 h-2 rounded-full bg-[#444444] group-hover:bg-[#666666] transition-colors"></div>
										{/if}
									</div>

									<div class="flex items-center gap-2">
										<span class="text-sm {group.isToday ? 'text-white font-semibold' : 'text-[#999999] font-normal'}">
											{group.title}
										</span>
										<span class="text-[11px] text-[#555555] font-mono">
											({group.messages.length} stories)
										</span>
									</div>
								</div>

								<!-- Bulleted Stories List with Full Interactive Utility Bar -->
								<div class="flex flex-col ml-5 gap-1">
									{#each visibleMessages as msg, msgIndex (msg.id)}
										{@const isExpanded = Boolean(expandedMessages[msg.id])}
										{@const isLong = (msg.text || '').length > 180}
										{@const timeStr = formatMessageTime(msg.postedAt)}
										{@const chCount = channelCounts[msg.channelName] || 0}
										{@const colorTheme = getChannelColor(chCount)}
										{@const isStarred = starredIds.has(msg.id)}
										{@const isPlaying = playingSpeechId === msg.id}

										<!-- Interactive Story Card -->
										<div
											id={groupIndex === 0 && msgIndex === 0 ? "tour-story-item" : undefined}
											role="button"
											tabindex="0"
											onclick={() => openSummary(msg, msg.channelName)}
											onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') openSummary(msg, msg.channelName); }}
											class="group relative rounded-xl px-3 py-2 -mx-2 hover:bg-[#151515] transition-all flex items-start gap-3 cursor-pointer text-left focus:outline-none focus:bg-[#181818] border border-transparent hover:border-[#222222]"
										>
											<!-- Bullet Dot Marker with Channel Hex Accent -->
											<div class="w-1.5 h-1.5 rounded-full mt-2 shrink-0 group-hover:scale-125 transition-all" style="background-color: {colorTheme.hex}"></div>

											<!-- Message Body -->
											<div class="flex-1 flex flex-col gap-1 min-w-0">
												<div class="flex items-center justify-between gap-2">
													<!-- Clickable Channel Pill (1-Tap Channel Filter) -->
													<div class="flex items-center gap-1.5">
														<button
															type="button"
															onclick={(e) => { e.stopPropagation(); selectChannel(msg.channelId); }}
															class="text-[11px] font-medium {colorTheme.text} hover:underline cursor-pointer transition-colors"
															title="Filter this channel ({msg.channelName})"
														>
															{msg.channelName}
														</button>
														<span class="text-[10px] text-[#555555]">
															• {timeStr}
														</span>
													</div>

													<!-- Interactive Quick Actions Bar -->
													<div class="flex items-center gap-1">
														{#if msg.hasMedia}
															<span class="inline-flex items-center gap-1 text-[10px] text-[#777777] bg-[#1a1a1a] px-1.5 py-0.5 rounded">
																<ImageIcon class="w-2.5 h-2.5" />
																Media
															</span>
														{/if}

														<!-- Text-to-Speech Voice Button (Coming Soon) -->
														{#if msg.text}
															<div class="relative flex items-center">
																<button
																	type="button"
																	onclick={(e) => speakStory(e, msg.id, msg.text || '')}
																	class="opacity-0 group-hover:opacity-100 text-[#666666] hover:text-[#f43f5e] p-1 rounded hover:bg-[#202020] transition-all cursor-pointer"
																	title="Audio Voice Narration • Coming Soon"
																>
																	<Volume2 class="w-3 h-3" />
																</button>
																{#if ttsComingSoonId === msg.id}
																	<span class="absolute right-0 -top-6 z-30 whitespace-nowrap bg-[#1c1c1c] border border-[#f43f5e]/40 text-[#f43f5e] text-[10px] font-medium px-2 py-0.5 rounded-md shadow-lg">
																		Audio Narration • Coming Soon
																	</span>
																{/if}
															</div>
														{/if}

														<!-- Bookmark / Star Button -->
														<button
															type="button"
															onclick={(e) => toggleStar(e, msg.id)}
															class="{isStarred ? 'opacity-100 text-[#fbbf24]' : 'opacity-0 group-hover:opacity-100 text-[#666666] hover:text-[#fbbf24]'} p-1 rounded hover:bg-[#202020] transition-all cursor-pointer"
															title="{isStarred ? 'Remove bookmark' : 'Bookmark story'}"
														>
															<Star class="w-3 h-3 {isStarred ? 'fill-[#fbbf24]' : ''}" />
														</button>

														<!-- Share / Forward Button -->
														<button
															type="button"
															onclick={(e) => shareStory(e, msg, msg.channelName)}
															class="opacity-0 group-hover:opacity-100 text-[#666666] hover:text-white p-1 rounded hover:bg-[#202020] transition-all cursor-pointer"
															title="Share story"
														>
															<Share2 class="w-3 h-3" />
														</button>

														<!-- Copy Raw Text Button -->
														{#if msg.text}
															<button
																type="button"
																onclick={(e) => copyText(e, msg.id, msg.text || '')}
																class="opacity-0 group-hover:opacity-100 text-[#666666] hover:text-white p-1 rounded hover:bg-[#202020] transition-all cursor-pointer"
																title="Copy raw story text"
															>
																{#if copiedId === msg.id}
																	<Check class="w-3 h-3 text-[#f43f5e]" />
																{:else}
																	<Copy class="w-3 h-3" />
																{/if}
															</button>
														{/if}
													</div>
												</div>

												<!-- Raw Story Text -->
												{#if msg.text}
													<p class="text-xs text-[#cccccc] group-hover:text-white leading-relaxed font-normal whitespace-pre-wrap break-words transition-colors">
														{#if isLong && !isExpanded}
															{truncateUtf8(msg.text, 180)}
														{:else}
															{msg.text}
														{/if}
													</p>

													{#if isLong}
														<button
															type="button"
															onclick={(e) => toggleExpand(e, msg.id)}
															class="self-start text-[11px] text-[#777777] hover:text-[#dddddd] transition-colors pt-0.5 cursor-pointer flex items-center gap-1"
														>
															<span>{isExpanded ? 'Show less' : 'Read more'}</span>
															{#if isExpanded}
																<ChevronUp class="w-3 h-3" />
															{:else}
																<ChevronDown class="w-3 h-3" />
															{/if}
														</button>
													{/if}
												{:else if msg.hasMedia}
													<p class="text-xs text-[#666666] italic">[Media update]</p>
												{/if}

												<!-- Inline Story Media Thumbnail -->
												{#if msg.hasMedia && msg.telegramMessageId}
													<div class="mt-1.5 rounded-xl overflow-hidden bg-[#161616] border border-[#242424] max-w-sm max-h-52">
														<img
															src={`/api/media/${msg.channelId}/${msg.telegramMessageId}`}
															alt={`Attachment from ${msg.channelName}`}
															loading="lazy"
															class="w-full h-auto max-h-52 object-cover rounded-xl hover:scale-[1.02] transition-transform duration-300"
															onerror={(e) => {
																const target = e.currentTarget as HTMLElement;
																target.style.display = 'none';
															}}
														/>
													</div>
												{/if}
											</div>
										</div>
									{/each}

									{#if hasMoreInGroup}
										<button
											type="button"
											onclick={() => showMoreInGroup(group.id, group.messages.length)}
											class="self-start text-xs text-[#888888] hover:text-white bg-[#141414] hover:bg-[#1c1c1c] border border-[#222222] px-3 py-1.5 rounded-xl transition-all mt-1 cursor-pointer flex items-center gap-1.5"
										>
											<Plus class="w-3 h-3 text-[#f43f5e]" />
											<span>Show {group.messages.length - maxMsgLimit} more stories from {group.title}</span>
										</button>
									{/if}
								</div>
							</div>
						{/each}

						{#if visibleGroupsCount < allGroups.length}
							<div class="pt-4 flex justify-center">
								<button
									type="button"
									onclick={() => visibleGroupsCount += 8}
									class="px-5 py-2.5 rounded-2xl bg-[#141414] hover:bg-[#1c1c1c] border border-[#262626] text-xs font-medium text-white transition-all shadow-md cursor-pointer flex items-center gap-2"
								>
									<span>Load older timeline dates</span>
									<ChevronDown class="w-3.5 h-3.5 text-[#888888]" />
								</button>
							</div>
						{/if}
					</div>
				{/if}

			<!-- 2. DEDICATED CHANNELS DIRECTORY VIEW -->
			{:else if activeTab === 'channels'}
				<div class="flex flex-col gap-6">
					<div class="flex items-center justify-between">
						<div>
							<h2 class="text-base font-semibold text-white">Subscribed Channels</h2>
							<p class="text-xs text-[#777777] mt-0.5">Manage and filter your tracked Telegram channels</p>
						</div>
						<button
							type="button"
							onclick={clearAllFilters}
							class="text-xs font-medium px-3 py-1.5 rounded-xl bg-[#1c1c1c] border border-[#2d2d2d] text-white hover:bg-[#252525] transition-all cursor-pointer"
						>
							View All in Timeline
						</button>
					</div>

					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						{#each visibleChannels as ch (ch.id)}
							{@const channelCards = (data.dayCards || []).filter((c) => c.channelId === ch.id)}
							{@const msgCount = channelCards.reduce((acc, c) => acc + c.messageCount, 0)}
							{@const latestMsg = channelCards[0]?.messages[channelCards[0].messages.length - 1]?.text}
							{@const isSelected = selectedChannelFilter === ch.id}
							{@const colorTheme = getChannelColor(msgCount)}

							<div class="p-5 rounded-2xl bg-[#141414] border {isSelected ? 'border-[#f43f5e]/50 shadow-lg shadow-[#f43f5e]/5' : 'border-[#222222] hover:border-[#333333]'} transition-all flex flex-col justify-between gap-4">
								<div class="flex flex-col gap-2">
									<div class="flex items-center justify-between">
										<div class="flex items-center gap-2 min-w-0">
											<div class="w-2 h-2 rounded-full shrink-0" style="background-color: {colorTheme.hex}"></div>
											<h3 class="text-sm font-semibold text-white truncate">{ch.name}</h3>
										</div>
										<span class="text-[11px] px-2 py-0.5 rounded-md border {colorTheme.bg} {colorTheme.text} {colorTheme.border} font-mono">
											{msgCount} msgs
										</span>
									</div>
									{#if latestMsg}
										<p class="text-xs text-[#888888] line-clamp-2 leading-relaxed">
											{truncateUtf8(latestMsg, 120)}
										</p>
									{/if}
								</div>

								<div class="flex items-center justify-between pt-2 border-t border-[#1c1c1c]">
									<button
										type="button"
										onclick={() => selectChannel(ch.id)}
										class="text-xs font-medium text-[#f43f5e] hover:text-[#fb7185] flex items-center gap-1 transition-colors cursor-pointer"
									>
										<span>{isSelected ? 'Active Filter' : 'Filter this channel'}</span>
										<ArrowUpRight class="w-3.5 h-3.5" />
									</button>

									{#if isSelected}
										<button
											type="button"
											onclick={() => selectChannel(null)}
											class="text-[11px] text-[#777777] hover:text-white cursor-pointer"
										>
											Clear
										</button>
									{/if}
								</div>
							</div>
						{/each}
					</div>

					{#if visibleChannelsCount < data.channels.length}
						<div class="pt-2 flex justify-center">
							<button
								type="button"
								onclick={() => { visibleChannelsCount += 8; triggerHaptic(); }}
								class="px-5 py-2.5 rounded-2xl bg-[#141414] hover:bg-[#1c1c1c] border border-[#262626] text-xs font-medium text-white transition-all shadow-md cursor-pointer flex items-center gap-2"
							>
								<span>Load more channels ({data.channels.length - visibleChannelsCount} remaining)</span>
								<ChevronDown class="w-3.5 h-3.5 text-[#888888]" />
							</button>
						</div>
					{/if}
				</div>

			<!-- 3. DEDICATED ACTIVITY METRICS VIEW -->
			{:else if activeTab === 'stats'}
				<div class="flex flex-col gap-6">
					<div>
						<h2 class="text-base font-semibold text-white">Activity Metrics</h2>
						<p class="text-xs text-[#777777] mt-0.5">Volume distribution and posting activity across channels</p>
					</div>

					<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
						<div class="p-5 rounded-2xl bg-[#141414] border border-[#222222] flex flex-col gap-1">
							<span class="text-xs text-[#777777]">Total Stories Indexed</span>
							<span class="text-2xl font-bold text-white">{data.stats.messageCount}</span>
						</div>
						<div class="p-5 rounded-2xl bg-[#141414] border border-[#222222] flex flex-col gap-1">
							<span class="text-xs text-[#777777]">Tracked Channels</span>
							<span class="text-2xl font-bold text-white">{data.stats.channelCount}</span>
						</div>
						<div class="p-5 rounded-2xl bg-[#141414] border border-[#222222] flex flex-col gap-1">
							<span class="text-xs text-[#777777]">Active Timeline Days</span>
							<span class="text-2xl font-bold text-white">{data.stats.dayCount}</span>
						</div>
					</div>

					<div class="p-6 rounded-2xl bg-[#141414] border border-[#222222] flex flex-col gap-4">
						<div class="flex items-center justify-between">
							<h3 class="text-xs font-semibold uppercase tracking-wider text-[#888888] flex items-center gap-2">
								<Activity class="w-4 h-4 text-[#f43f5e]" />
								Channel Volume Share
							</h3>
							<span class="text-[11px] text-[#666666]">
								% of total indexed stories
							</span>
						</div>

						<p class="text-[11px] text-[#777777] leading-relaxed -mt-1">
							The percentage indicates each channel's share of your total reading volume across all synced channels.
						</p>

						<div class="flex flex-col gap-3.5 pt-2">
							{#each data.channels as ch (ch.id)}
								{@const count = (data.dayCards || []).filter((c) => c.channelId === ch.id).reduce((a, b) => a + b.messageCount, 0)}
								{@const pct = data.stats.messageCount > 0 ? ((count / data.stats.messageCount) * 100).toFixed(1) : '0'}
								{@const colorTheme = getChannelColor(count)}

								<div class="flex flex-col gap-1.5 text-xs">
									<div class="flex items-center justify-between text-[#cccccc]">
										<div class="flex items-center gap-2 truncate max-w-[240px] sm:max-w-md">
											<div class="w-2 h-2 rounded-full shrink-0" style="background-color: {colorTheme.hex}"></div>
											<span class="truncate">{ch.name}</span>
										</div>
										<span class="font-mono {colorTheme.text} shrink-0">{count} msgs ({pct}%)</span>
									</div>
									<div class="w-full h-1.5 rounded-full bg-[#1c1c1c] overflow-hidden">
										<div class="h-full rounded-full" style="width: {pct}%; background-color: {colorTheme.hex}"></div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>

			<!-- 4. DEDICATED MEDIA GALLERY VIEW -->
			{:else if activeTab === 'media'}
				<div class="flex flex-col gap-6">
					<div class="flex items-center justify-between">
						<div>
							<h2 class="text-base font-semibold text-white">Media Gallery ({mediaItems.length})</h2>
							<p class="text-xs text-[#777777] mt-0.5">All updates with attached media, photos, or documents</p>
						</div>
						{#if selectedChannelName || selectedWeekdays.length > 0 || searchQuery}
							<button
								type="button"
								onclick={clearAllFilters}
								class="text-xs font-medium px-3 py-1.5 rounded-xl bg-[#1c1c1c] border border-[#2d2d2d] text-white hover:bg-[#252525] transition-all cursor-pointer"
							>
								Show All
							</button>
						{/if}
					</div>

					{#if mediaItems.length === 0}
						<div class="p-12 rounded-3xl bg-[#141414] border border-[#222222] text-center text-xs text-[#777777] flex flex-col items-center gap-2">
							<ImageIcon class="w-8 h-8 text-[#444444]" />
							<p>No media attachments found {selectedChannelName ? `for ${selectedChannelName}` : 'matching this filter'}.</p>
						</div>
					{:else}
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
							{#each mediaItems.slice(0, 20) as item (item.id)}
								{@const chCount = channelCounts[item.channelName] || 0}
								{@const colorTheme = getChannelColor(chCount)}
								{@const isStarred = starredIds.has(item.id)}

								<div
									role="button"
									tabindex="0"
									onclick={() => openSummary(item.rawMsg, item.channelName)}
									onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') openSummary(item.rawMsg, item.channelName); }}
									class="group p-5 rounded-2xl bg-[#141414] hover:bg-[#161616] border border-[#222222] hover:border-[#333333] transition-all flex flex-col justify-between gap-3 text-left cursor-pointer focus:outline-none focus:border-[#f43f5e]"
								>
									<div class="flex flex-col gap-3">
										<div class="flex items-center justify-between text-xs">
											<div class="flex items-center gap-1.5 min-w-0">
												<div class="w-2 h-2 rounded-full shrink-0" style="background-color: {colorTheme.hex}"></div>
												<span class="font-medium {colorTheme.text} truncate">{item.channelName}</span>
											</div>
											<span class="text-[11px] text-[#666666] shrink-0">{formatMessageTime(item.postedAt)}</span>
										</div>

										<!-- Media Preview Card with Dynamic MTProto Photo Streaming -->
										<div class="h-44 sm:h-48 rounded-xl bg-[#191919] border border-[#262626] group-hover:border-[#383838] overflow-hidden relative transition-all flex items-center justify-center">
											{#if item.rawMsg?.telegramMessageId}
												<img
													src={`/api/media/${item.rawMsg.channelId}/${item.rawMsg.telegramMessageId}`}
													alt={`Media from ${item.channelName}`}
													loading="lazy"
													class="w-full h-full object-cover rounded-xl group-hover:scale-105 transition-transform duration-300"
													onerror={(e) => {
														const target = e.currentTarget as HTMLImageElement;
														target.style.display = 'none';
														const fb = target.nextElementSibling as HTMLElement;
														if (fb) fb.classList.remove('hidden');
													}}
												/>
											{/if}
											<div class="flex-col items-center justify-center gap-1.5 text-[#666666] group-hover:text-[#999999] p-4 text-center {item.rawMsg?.telegramMessageId ? 'hidden' : 'flex'}">
												<ImageIcon class="w-7 h-7 text-[#f43f5e]" />
												<span class="text-[11px] font-mono font-medium">Telegram Media Attachment</span>
											</div>
										</div>

										{#if item.text}
											<p class="text-xs text-[#cccccc] group-hover:text-white line-clamp-3 leading-relaxed transition-colors">
												{item.text}
											</p>
										{/if}
									</div>

									<div class="flex items-center justify-between pt-2 border-t border-[#1c1c1c] text-xs">
										<button
											type="button"
											onclick={(e) => { e.stopPropagation(); selectChannel(item.rawMsg.channelId); }}
											class="text-[11px] text-[#888888] hover:text-[#f43f5e] transition-colors cursor-pointer"
										>
											Filter channel
										</button>
										<div class="flex items-center gap-2">
											<button
												type="button"
												onclick={(e) => toggleStar(e, item.id)}
												class="p-1 text-[#666666] hover:text-[#fbbf24] transition-colors cursor-pointer"
												title="Bookmark story"
											>
												<Star class="w-3.5 h-3.5 {isStarred ? 'fill-[#fbbf24] text-[#fbbf24]' : ''}" />
											</button>
											<span class="text-[11px] text-[#f43f5e] font-medium flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
												Open <ArrowUpRight class="w-3 h-3" />
											</span>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</main>

	<!-- Interactive Keyboard Shortcuts Cheatsheet Modal -->
	{#if isShortcutsModalOpen}
		<div class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
			<div class="w-full max-w-md bg-[#141414] border border-[#282828] rounded-3xl p-6 flex flex-col gap-5 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
				<button
					type="button"
					onclick={() => isShortcutsModalOpen = false}
					class="absolute right-5 top-5 text-[#777777] hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
				>
					<X class="w-4 h-4" />
				</button>

				<div class="flex items-center gap-2">
					<Keyboard class="w-4 h-4 text-[#f43f5e]" />
					<h3 class="text-sm font-semibold text-white">Keyboard Shortcuts</h3>
				</div>

				<div class="flex flex-col gap-2.5 text-xs">
					<div class="flex items-center justify-between py-1 border-b border-[#1f1f1f]">
						<span class="text-[#888888]">Quick Search</span>
						<div class="flex items-center gap-1">
							<kbd class="px-2 py-0.5 bg-[#1e1e1e] border border-[#333333] rounded font-mono text-white">⌘K</kbd>
							<span class="text-[#555555]">or</span>
							<kbd class="px-2 py-0.5 bg-[#1e1e1e] border border-[#333333] rounded font-mono text-white">/</kbd>
						</div>
					</div>

					<div class="flex items-center justify-between py-1 border-b border-[#1f1f1f]">
						<span class="text-[#888888]">Switch to Timeline</span>
						<kbd class="px-2 py-0.5 bg-[#1e1e1e] border border-[#333333] rounded font-mono text-white">1</kbd>
					</div>

					<div class="flex items-center justify-between py-1 border-b border-[#1f1f1f]">
						<span class="text-[#888888]">Switch to Channels</span>
						<kbd class="px-2 py-0.5 bg-[#1e1e1e] border border-[#333333] rounded font-mono text-white">2</kbd>
					</div>

					<div class="flex items-center justify-between py-1 border-b border-[#1f1f1f]">
						<span class="text-[#888888]">Switch to Metrics</span>
						<kbd class="px-2 py-0.5 bg-[#1e1e1e] border border-[#333333] rounded font-mono text-white">3</kbd>
					</div>

					<div class="flex items-center justify-between py-1 border-b border-[#1f1f1f]">
						<span class="text-[#888888]">Switch to Media</span>
						<kbd class="px-2 py-0.5 bg-[#1e1e1e] border border-[#333333] rounded font-mono text-white">4</kbd>
					</div>

					<div class="flex items-center justify-between py-1 border-b border-[#1f1f1f]">
						<span class="text-[#888888]">Switch to Starred</span>
						<kbd class="px-2 py-0.5 bg-[#1e1e1e] border border-[#333333] rounded font-mono text-white">5</kbd>
					</div>

					<div class="flex items-center justify-between py-1 border-b border-[#1f1f1f]">
						<span class="text-[#888888]">Day / Week / Month Views</span>
						<div class="flex items-center gap-1">
							<kbd class="px-1.5 py-0.5 bg-[#1e1e1e] border border-[#333333] rounded font-mono text-white">D</kbd>
							<kbd class="px-1.5 py-0.5 bg-[#1e1e1e] border border-[#333333] rounded font-mono text-white">W</kbd>
							<kbd class="px-1.5 py-0.5 bg-[#1e1e1e] border border-[#333333] rounded font-mono text-white">M</kbd>
						</div>
					</div>

					<div class="flex items-center justify-between py-1">
						<span class="text-[#888888]">Close Modals / Clear Search</span>
						<kbd class="px-2 py-0.5 bg-[#1e1e1e] border border-[#333333] rounded font-mono text-white">Esc</kbd>
					</div>
				</div>

				<div class="flex items-center gap-2 pt-1 border-t border-[#222222]">
					<button
						type="button"
						onclick={startOnboardingTour}
						class="flex-1 py-2.5 rounded-xl bg-[#1c1c1c] hover:bg-[#252525] border border-[#2d2d2d] text-xs font-medium text-[#cccccc] hover:text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
					>
						<Compass class="w-3.5 h-3.5 text-[#f43f5e]" />
						<span>App Tour</span>
					</button>
					<button
						type="button"
						onclick={() => isShortcutsModalOpen = false}
						class="flex-1 py-2.5 rounded-xl bg-[#222222] hover:bg-[#2a2a2a] text-xs font-medium text-white transition-colors cursor-pointer"
					>
						Got it
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Sleek Minimalist AI Summary Modal ("Coming Soon") -->
	{#if selectedStory}
		<div class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
			<div class="w-full max-w-lg bg-[#141414] border border-[#262626] rounded-3xl p-6 sm:p-7 flex flex-col gap-5 shadow-2xl shadow-black relative animate-in fade-in zoom-in-95 duration-200">
				<!-- Close Button -->
				<button
					type="button"
					onclick={closeSummary}
					class="absolute right-5 top-5 text-[#777777] hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
				>
					<X class="w-4 h-4" />
				</button>

				<!-- Header with Channel & Coming Soon Pill -->
				<div class="flex flex-col gap-1.5 pr-8">
					<div class="flex items-center gap-2">
						<span class="text-xs font-medium text-[#aaaaaa]">{selectedStory.channelName}</span>
						<span class="text-[10px] px-2 py-0.5 rounded-full bg-[#f43f5e]/10 text-[#f43f5e] border border-[#f43f5e]/30 font-medium">
							AI Summary • Coming Soon
						</span>
					</div>
					<h3 class="text-base font-semibold text-white">Story Intelligence</h3>
				</div>

				<!-- AI Summary Coming Soon Notice Card -->
				<div class="p-4 rounded-2xl bg-[#1a1a1a] border border-[#282828] flex items-start gap-3">
					<div class="w-8 h-8 rounded-xl bg-[#242424] text-[#f43f5e] flex items-center justify-center shrink-0 mt-0.5">
						<Sparkles class="w-4 h-4" />
					</div>
					<div class="flex flex-col gap-1 text-xs">
						<span class="font-medium text-white">Automated AI Summaries coming in v2</span>
						<p class="text-[#888888] leading-relaxed">
							Sift currently guarantees unedited chronological preservation without loss. AI multi-channel synthesis and contextual highlights will arrive in the next major update.
						</p>
					</div>
				</div>

				<!-- Raw Full Text Preview -->
				{#if selectedStory.text}
					<div class="flex flex-col gap-2">
						<div class="flex items-center justify-between text-xs text-[#666666]">
							<span>Full Raw Message</span>
							<span>{formatMessageTime(selectedStory.postedAt)}</span>
						</div>
						<div class="max-h-48 overflow-y-auto rounded-xl bg-[#0e0e0e] border border-[#1e1e1e] p-3 text-xs text-[#cccccc] leading-relaxed whitespace-pre-wrap break-words select-text">
							{selectedStory.text}
						</div>
					</div>
				{/if}

				<!-- Modal Actions -->
				<div class="flex items-center justify-end gap-2 pt-2 border-t border-[#222222]">
					{#if selectedStory.text}
						<button
							type="button"
							onclick={(e) => copyText(e, selectedStory?.id || '', selectedStory?.text || '')}
							class="px-4 py-2 rounded-xl bg-[#1f1f1f] hover:bg-[#282828] text-xs font-medium text-white transition-all flex items-center gap-1.5 cursor-pointer"
						>
							{#if copiedId === selectedStory.id}
								<Check class="w-3.5 h-3.5 text-[#f43f5e]" />
								<span>Copied</span>
							{:else}
								<Copy class="w-3.5 h-3.5 text-[#888888]" />
								<span>Copy Story</span>
							{/if}
						</button>
					{/if}
					<button
						type="button"
						onclick={closeSummary}
						class="px-4 py-2 rounded-xl bg-[#f43f5e] hover:bg-[#e11d48] text-xs font-medium text-white transition-all cursor-pointer shadow-md shadow-[#f43f5e]/20"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Interactive Account Status Modal -->
	{#if isAccountModalOpen}
		<div class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
			<div class="w-full max-w-md bg-[#141414] border border-[#282828] rounded-3xl p-6 sm:p-7 flex flex-col gap-5 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
				<!-- Close Button -->
				<button
					type="button"
					onclick={() => isAccountModalOpen = false}
					class="absolute right-5 top-5 text-[#777777] hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
				>
					<X class="w-4 h-4" />
				</button>

				<div class="flex items-center gap-3">
					<div class="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
						<UserCheck class="w-5 h-5" />
					</div>
					<div class="flex flex-col">
						<h3 class="text-base font-semibold text-white">Account Status</h3>
						<span class="text-xs text-emerald-400 flex items-center gap-1.5 font-medium">
							<span class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
							Telegram MTProto Connected
						</span>
					</div>
				</div>

				<!-- Status Info Grid -->
				<div class="grid grid-cols-2 gap-3">
					<div class="p-3.5 rounded-xl bg-[#1a1a1a] border border-[#262626] flex flex-col gap-0.5">
						<span class="text-[11px] text-[#777777]">Tracked Channels</span>
						<span class="text-sm font-semibold text-white font-mono">{data.channels.length} channels</span>
					</div>
					<div class="p-3.5 rounded-xl bg-[#1a1a1a] border border-[#262626] flex flex-col gap-0.5">
						<span class="text-[11px] text-[#777777]">Indexed Stories</span>
						<span class="text-sm font-semibold text-white font-mono">{data.stats.messageCount} stories</span>
					</div>
				</div>

				<!-- Session Details Card -->
				<div class="p-4 rounded-xl bg-[#1a1a1a] border border-[#262626] flex flex-col gap-2.5 text-xs">
					<div class="flex items-center justify-between text-[#888888]">
						<span>Session Security</span>
						<span class="text-emerald-400 font-mono flex items-center gap-1">
							<ShieldCheck class="w-3.5 h-3.5" /> Encrypted & Stored
						</span>
					</div>
					{#if data.sessionUpdatedAt}
						<div class="flex items-center justify-between text-[#888888]">
							<span>Last Session Activity</span>
							<span class="text-[#cccccc] font-mono">{new Date(data.sessionUpdatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
						</div>
					{/if}
				</div>

				<!-- Actions -->
				<div class="flex flex-col gap-2 pt-2 border-t border-[#222222]">
					<button
						type="button"
						onclick={() => { isAccountModalOpen = false; handleSync(); }}
						disabled={isSyncing || isLoggingOut}
						class="w-full py-2.5 rounded-xl bg-[#f43f5e] hover:bg-[#e11d48] text-xs font-semibold text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-[#f43f5e]/20 disabled:opacity-50"
					>
						<RefreshCw class="w-3.5 h-3.5 {isSyncing ? 'animate-spin' : ''}" />
						<span>{isSyncing ? 'Syncing Stories...' : 'Sync Latest Stories Now'}</span>
					</button>

					<button
						type="button"
						onclick={() => handleLogout(true)}
						disabled={isLoggingOut}
						class="w-full py-2.5 rounded-xl bg-[#1c1c1c] hover:bg-[#252525] border border-[#2c2c2c] text-xs font-medium text-[#cccccc] hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
					>
						<span>{isLoggingOut ? 'Clearing session...' : 'Switch Account / Re-authenticate'}</span>
					</button>

					<button
						type="button"
						onclick={() => handleLogout(false)}
						disabled={isLoggingOut}
						class="w-full py-2 rounded-xl text-xs font-medium text-[#ef4444] hover:text-[#f87171] hover:bg-[#ef4444]/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
					>
						<LogOut class="w-3.5 h-3.5" />
						<span>{isLoggingOut ? 'Logging out...' : 'Log Out & Clear Session'}</span>
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Dynamic Moving Spotlight Tour with Anchored Tooltip -->
	{#if isOnboardingOpen}
		{@const currentTour = onboardingTourSteps[onboardingStep]}
		<div class="fixed inset-0 z-50 pointer-events-none transition-all duration-300">
			<!-- Dark translucent backdrop with smooth cut-out mask for the active spotlight target -->
			<svg class="absolute inset-0 w-full h-full pointer-events-auto" onclick={finishOnboarding}>
				<defs>
					<mask id="spotlight-mask">
						<rect width="100%" height="100%" fill="white" />
						{#if spotlightRect}
							<rect
								x={spotlightRect.left}
								y={spotlightRect.top}
								width={spotlightRect.width}
								height={spotlightRect.height}
								rx="16"
								fill="black"
							/>
						{/if}
					</mask>
				</defs>
				<rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.78)" mask="url(#spotlight-mask)" />
			</svg>

			<!-- Glowing Animated Spotlight Focus Ring -->
			{#if spotlightRect}
				<div
					class="absolute pointer-events-none rounded-2xl ring-2 ring-[#f43f5e] shadow-[0_0_30px_rgba(244,63,94,0.45)] transition-all duration-300 ease-out"
					style="top: {spotlightRect.top}px; left: {spotlightRect.left}px; width: {spotlightRect.width}px; height: {spotlightRect.height}px;"
				></div>
			{/if}

			<!-- Floating Anchored Tooltip Card (Moves dynamically with each step) -->
			<div
				class="absolute pointer-events-auto w-[calc(100vw-32px)] max-w-[420px] bg-[#141414] border border-[#2d2d2d] rounded-2xl p-5 sm:p-6 flex flex-col gap-4 shadow-2xl shadow-black transition-all duration-300 ease-out z-50 animate-in fade-in zoom-in-95 duration-150"
				style="top: {tooltipStyle.top}px; left: {tooltipStyle.left}px;"
			>
				<!-- Tooltip Directional Triangular Arrow Pointer -->
				{#if tooltipStyle.placement === 'bottom'}
					<div
						class="absolute -top-2 w-4 h-4 bg-[#141414] border-t border-l border-[#2d2d2d] rotate-45 transition-all duration-300"
						style="left: {tooltipStyle.arrowOffset}px;"
					></div>
				{:else if tooltipStyle.placement === 'top'}
					<div
						class="absolute -bottom-2 w-4 h-4 bg-[#141414] border-b border-r border-[#2d2d2d] rotate-45 transition-all duration-300"
						style="left: {tooltipStyle.arrowOffset}px;"
					></div>
				{:else if tooltipStyle.placement === 'right'}
					<div
						class="absolute -left-2 w-4 h-4 bg-[#141414] border-b border-l border-[#2d2d2d] rotate-45 transition-all duration-300"
						style="top: {tooltipStyle.arrowOffset}px;"
					></div>
				{/if}

				<!-- Top Bar: Tag Badge & Skip Button -->
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<span class="text-[10px] font-semibold uppercase tracking-wider text-[#f43f5e] bg-[#f43f5e]/10 px-2 py-0.5 rounded-full border border-[#f43f5e]/20">
							{currentTour.tag}
						</span>
						<span class="text-[11px] text-[#666666] font-mono">{currentTour.badge}</span>
					</div>

					<button
						type="button"
						onclick={finishOnboarding}
						class="text-xs text-[#777777] hover:text-white transition-colors px-2 py-0.5 rounded-lg hover:bg-[#1f1f1f] cursor-pointer"
					>
						Skip Tour
					</button>
				</div>

				<!-- Step Content -->
				<div class="flex flex-col gap-2.5">
					<div class="flex items-center gap-2.5">
						<div class="w-9 h-9 rounded-xl bg-gradient-to-br from-[#f43f5e]/20 to-[#f43f5e]/5 border border-[#f43f5e]/30 flex items-center justify-center text-[#f43f5e] shrink-0 shadow-md shadow-[#f43f5e]/10">
							{#if onboardingStep === 0}
								<Sparkles class="w-4 h-4" />
							{:else if onboardingStep === 1}
								<CalendarDays class="w-4 h-4" />
							{:else if onboardingStep === 2}
								<Search class="w-4 h-4" />
							{:else if onboardingStep === 3}
								<Activity class="w-4 h-4" />
							{:else}
								<Keyboard class="w-4 h-4" />
							{/if}
						</div>
						<h2 class="text-base font-semibold text-white tracking-tight leading-snug">
							{currentTour.title}
						</h2>
					</div>

					<p class="text-xs text-[#999999] leading-relaxed">
						{currentTour.description}
					</p>

					<!-- Highlight / Pro-Tip Box -->
					<div class="p-3 rounded-xl bg-[#191919] border border-[#242424] flex items-start gap-2 text-xs text-[#cccccc]">
						<Lightbulb class="w-3.5 h-3.5 text-[#fbbf24] shrink-0 mt-0.5" />
						<span class="leading-relaxed text-[11px]">{currentTour.tip}</span>
					</div>
				</div>

				<!-- Stepper Dots & Navigation Buttons -->
				<div class="flex flex-col gap-3 pt-1 border-t border-[#202020]">
					<div class="flex items-center justify-between">
						<!-- Stepper Dots Indicator -->
						<div class="flex items-center gap-1.5">
							{#each onboardingTourSteps as _, i}
								<button
									type="button"
									onclick={() => onboardingStep = i}
									class="h-1.5 rounded-full transition-all duration-300 cursor-pointer {onboardingStep === i ? 'w-5 bg-[#f43f5e]' : 'w-1.5 bg-[#333333] hover:bg-[#555555]'}"
									title={`Jump to Step ${i + 1}`}
								></button>
							{/each}
						</div>

						<!-- Next / Back Actions -->
						<div class="flex items-center gap-2">
							{#if onboardingStep > 0}
								<button
									type="button"
									onclick={() => onboardingStep--}
									class="px-3 py-1.5 rounded-xl bg-[#1c1c1c] hover:bg-[#252525] border border-[#2b2b2b] text-xs font-medium text-[#cccccc] hover:text-white transition-all cursor-pointer flex items-center gap-1"
								>
									<ArrowLeft class="w-3.5 h-3.5" />
									<span>Back</span>
								</button>
							{/if}

							{#if onboardingStep < onboardingTourSteps.length - 1}
								<button
									type="button"
									onclick={() => onboardingStep++}
									class="px-3.5 py-1.5 rounded-xl bg-[#f43f5e] hover:bg-[#e11d48] text-xs font-semibold text-white transition-all shadow-md shadow-[#f43f5e]/20 flex items-center gap-1.5 cursor-pointer"
								>
									<span>Next Step</span>
									<ArrowRight class="w-3.5 h-3.5" />
								</button>
							{:else}
								<button
									type="button"
									onclick={finishOnboarding}
									class="px-3.5 py-1.5 rounded-xl bg-[#f43f5e] hover:bg-[#e11d48] text-xs font-semibold text-white transition-all shadow-md shadow-[#f43f5e]/20 flex items-center gap-1.5 cursor-pointer"
								>
									<CheckCircle2 class="w-3.5 h-3.5" />
									<span>Get Started</span>
								</button>
							{/if}
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
