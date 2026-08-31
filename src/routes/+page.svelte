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
		LogOut,
		ExternalLink,
		Clock,
		Flame,
		CheckCircle,
		BookOpen
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
	let isZenReaderOpen = $state(false);
	let zenStory = $state<{ title: string; channelName: string; text: string; time: string; channelColor: string } | null>(null);

	// Expandable long stories state
	let expandedStoryIds = $state<Set<string>>(new Set());

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
			tag: 'Time Granularity',
			title: 'Switch Day, Week & Month Views',
			description: 'Seamlessly zoom between Day, Week, and Month chronological views to inspect your updates at your preferred granularity.',
			tip: 'Zero AI Loss: Every story is preserved in full unedited text with multi-language script fidelity.',
			badge: 'Step 1 of 5'
		},
		{
			targetSelector: '#tour-weekday-filters',
			preferredPlacement: 'bottom' as const,
			tag: 'Weekday Filter',
			title: 'Filter by Specific Days & Presets',
			description: 'Click on individual weekday pills (e.g. Mon, Tue, Fri) or quick presets (Mon-Fri, Sat-Sun) to focus your reading on specific days.',
			tip: 'Active pills highlight in rose and update story counts dynamically.',
			badge: 'Step 2 of 5'
		},
		{
			targetSelector: '#tour-search-btn',
			preferredPlacement: 'bottom' as const,
			tag: 'Fuzzy Search & Palette',
			title: 'Search Anything with ⌘K or /',
			description: 'Press ⌘K (Ctrl+K) or / anywhere on your keyboard to instantly filter across all your indexed stories, topics, and channel handles in real-time.',
			tip: 'Search terms are highlighted directly on story snippets as you type.',
			badge: 'Step 3 of 5'
		},
		{
			targetSelector: '#tour-story-item',
			preferredPlacement: 'top' as const,
			tag: 'Story Superpowers',
			title: 'Bookmarks, Reader & Raw Text Copy',
			description: 'Every story card includes 1-tap actions: star/bookmark (★), open in distraction-free Zen Reader, copy raw text, and jump to Telegram.',
			tip: 'Channel names are color-coded based on posting volume so high-density channels stand out.',
			badge: 'Step 4 of 5'
		},
		{
			targetSelector: '#tour-sync-btn',
			preferredPlacement: 'bottom' as const,
			tag: 'Sync & Status',
			title: 'Manual Sync & Account Status',
			description: 'Click Sync anytime to pull the newest messages from your tracked channels. Opening channels in Sift automatically clears their badges in Telegram.',
			tip: 'Sift keeps your chronological timeline organized and lightning fast.',
			badge: 'Step 5 of 5'
		}
	];

	// Pagination & Infinite Scroll state
	let visibleGroupsCount = $state(15);
	let visibleChannelsCount = $state(30);
	let expandedGroupLimits = $state<Record<string, number>>({});
	let isSyncing = $state(false);
	let syncFeedback = $state('');

	// Starred Bookmarks (Persisted in localStorage)
	let starredIds = $state<Set<string>>(new Set());

	// Copy feedback state
	let copiedId = $state<string | null>(null);

	// Lightbox Modal for Full Resolution Images
	let activeLightboxImage = $state<string | null>(null);
	let isLightboxOpen = $state(false);

	onMount(() => {
		try {
			const saved = localStorage.getItem('sift_starred_messages');
			if (saved) {
				starredIds = new Set(JSON.parse(saved));
			}

			// Check first-time user tour (only if logged in)
			if (data.isLoggedIn) {
				const tourSeen = localStorage.getItem('sift_tour_completed_v3');
				if (!tourSeen) {
					setTimeout(() => {
						startOnboardingTour();
					}, 600);
				}
			}
		} catch (_) {}

		const handleKeyDown = (e: KeyboardEvent) => {
			if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
				if (e.key === 'Escape') {
					isSearchOpen = false;
					isLightboxOpen = false;
					isAccountModalOpen = false;
					isZenReaderOpen = false;
					isOnboardingOpen = false;
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

			if (e.key === 'Escape') {
				if (isOnboardingOpen) {
					finishOnboarding();
					return;
				}
				isSearchOpen = false;
				isLightboxOpen = false;
				isAccountModalOpen = false;
				isZenReaderOpen = false;
				return;
			}

			if (isOnboardingOpen) {
				if (e.key === 'ArrowRight') {
					e.preventDefault();
					nextOnboardingStep();
				} else if (e.key === 'ArrowLeft') {
					e.preventDefault();
					prevOnboardingStep();
				}
				return;
			}

			switch (e.key.toLowerCase()) {
				case '1':
					activeTab = 'timeline';
					triggerHaptic();
					break;
				case '2':
					activeTab = 'channels';
					triggerHaptic();
					break;
				case '3':
					activeTab = 'stats';
					triggerHaptic();
					break;
				case '4':
					activeTab = 'media';
					triggerHaptic();
					break;
				case '5':
					activeTab = 'starred';
					triggerHaptic();
					break;
				case 'd':
					switchTimeView('day');
					break;
				case 'w':
					switchTimeView('week');
					break;
				case 'm':
					switchTimeView('month');
					break;
				case 'r':
					handleSync();
					break;
			}
		};

		const handleResize = () => {
			if (isOnboardingOpen) {
				positionSpotlightAndTooltip(onboardingStep);
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('resize', handleResize);
		window.addEventListener('scroll', handleResize, true);

		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('scroll', handleResize, true);
		};
	});

	function triggerHaptic() {
		try {
			if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.HapticFeedback) {
				(window as any).Telegram.WebApp.HapticFeedback.impactOccurred('light');
			}
		} catch (_) {}
	}

	function toggleStoryExpand(storyId: string) {
		const newSet = new Set(expandedStoryIds);
		if (newSet.has(storyId)) {
			newSet.delete(storyId);
		} else {
			newSet.add(storyId);
		}
		expandedStoryIds = newSet;
		triggerHaptic();
	}

	function startOnboardingTour() {
		isOnboardingOpen = true;
		onboardingStep = 0;
		triggerHaptic();
		setTimeout(() => {
			positionSpotlightAndTooltip(0);
		}, 80);
	}

	function finishOnboarding() {
		isOnboardingOpen = false;
		spotlightRect = null;
		try {
			localStorage.setItem('sift_tour_completed_v3', 'true');
		} catch (_) {}
		triggerHaptic();
	}

	function positionSpotlightAndTooltip(stepIndex: number) {
		const step = onboardingTourSteps[stepIndex];
		if (!step) return;

		let targetEl = document.querySelector(step.targetSelector) as HTMLElement | null;
		
		if (!targetEl && step.targetSelector === '#tour-story-item') {
			targetEl = document.querySelector('.story-card-item') as HTMLElement | null;
		}

		if (!targetEl) {
			const viewportW = window.innerWidth;
			const viewportH = window.innerHeight;
			spotlightRect = {
				top: viewportH * 0.35,
				left: viewportW * 0.5 - 120,
				width: 240,
				height: 80
			};
			tooltipStyle = {
				top: Math.max(20, viewportH * 0.35 - 180),
				left: Math.max(16, (viewportW - Math.min(380, viewportW - 32)) / 2),
				placement: 'center',
				arrowOffset: 24
			};
			return;
		}

		targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

		const rect = targetEl.getBoundingClientRect();
		const padding = 6;
		const sTop = Math.max(0, rect.top - padding);
		const sLeft = Math.max(0, rect.left - padding);
		const sWidth = rect.width + padding * 2;
		const sHeight = rect.height + padding * 2;

		spotlightRect = {
			top: sTop,
			left: sLeft,
			width: sWidth,
			height: sHeight
		};

		const tooltipW = Math.min(380, window.innerWidth - 32);
		const tooltipH = 220;
		const margin = 14;

		let place = step.preferredPlacement;
		let tTop = 0;
		let tLeft = sLeft + (sWidth / 2) - (tooltipW / 2);

		if (tLeft < 16) tLeft = 16;
		if (tLeft + tooltipW > window.innerWidth - 16) {
			tLeft = window.innerWidth - tooltipW - 16;
		}

		if (place === 'bottom') {
			if (sTop + sHeight + margin + tooltipH > window.innerHeight) {
				place = 'top';
			}
		} else if (place === 'top') {
			if (sTop - margin - tooltipH < 10) {
				place = 'bottom';
			}
		}

		if (place === 'bottom') {
			tTop = sTop + sHeight + margin;
		} else if (place === 'top') {
			tTop = Math.max(10, sTop - tooltipH - margin);
		} else {
			tTop = sTop + sHeight + margin;
		}

		const arrowX = Math.max(20, Math.min(tooltipW - 20, (sLeft + sWidth / 2) - tLeft));

		tooltipStyle = {
			top: tTop,
			left: tLeft,
			placement: place,
			arrowOffset: arrowX
		};
	}

	function nextOnboardingStep() {
		if (onboardingStep < onboardingTourSteps.length - 1) {
			onboardingStep++;
			triggerHaptic();
			positionSpotlightAndTooltip(onboardingStep);
		} else {
			finishOnboarding();
		}
	}

	function prevOnboardingStep() {
		if (onboardingStep > 0) {
			onboardingStep--;
			triggerHaptic();
			positionSpotlightAndTooltip(onboardingStep);
		}
	}

	function toggleStar(messageId: string) {
		const newSet = new Set(starredIds);
		if (newSet.has(messageId)) {
			newSet.delete(messageId);
		} else {
			newSet.add(messageId);
		}
		starredIds = newSet;
		try {
			localStorage.setItem('sift_starred_messages', JSON.stringify(Array.from(newSet)));
		} catch (_) {}
		triggerHaptic();
	}

	function openReaderModal(title: string, channelName: string, text: string, time: string, color: string) {
		zenStory = { title, channelName, text, time, channelColor: color };
		isZenReaderOpen = true;
		triggerHaptic();
	}

	function copyText(id: string, text: string) {
		navigator.clipboard.writeText(text);
		copiedId = id;
		triggerHaptic();
		setTimeout(() => {
			if (copiedId === id) copiedId = null;
		}, 2000);
	}

	function openLightbox(url: string) {
		activeLightboxImage = url;
		isLightboxOpen = true;
		triggerHaptic();
	}

	function closeLightbox() {
		isLightboxOpen = false;
		activeLightboxImage = null;
	}

	function switchTimeView(newView: 'day' | 'week' | 'month') {
		timeView = newView;
		visibleGroupsCount = 15;
		triggerHaptic();
	}

	function selectChannel(channelId: string | null) {
		selectedChannelFilter = channelId;
		visibleGroupsCount = 15;
		activeTab = 'timeline';
		triggerHaptic();
	}

	function toggleWeekday(dayNum: number) {
		if (selectedWeekdays.includes(dayNum)) {
			selectedWeekdays = selectedWeekdays.filter((d) => d !== dayNum);
		} else {
			selectedWeekdays = [...selectedWeekdays, dayNum];
		}
		visibleGroupsCount = 15;
		triggerHaptic();
	}

	function setWeekdayPreset(preset: 'all' | 'weekdays' | 'weekends') {
		if (preset === 'all') {
			selectedWeekdays = [];
		} else if (preset === 'weekdays') {
			selectedWeekdays = [1, 2, 3, 4, 5];
		} else if (preset === 'weekends') {
			selectedWeekdays = [0, 6];
		}
		visibleGroupsCount = 15;
		triggerHaptic();
	}

	function clearAllFilters() {
		selectedChannelFilter = null;
		selectedWeekdays = [];
		searchQuery = '';
		visibleGroupsCount = 15;
		triggerHaptic();
	}

	async function handleLogout() {
		if (!confirm('Log out and wipe local cached session?')) return;
		try {
			const res = await fetch('/api/auth/logout', { method: 'POST' });
			if (res.ok) {
				window.location.href = '/login';
			} else {
				alert('Logout failed. Redirecting to login...');
				window.location.href = '/login';
			}
		} catch (err: any) {
			window.location.href = '/login';
		}
	}

	async function handleSync() {
		if (isSyncing) return;
		isSyncing = true;
		syncFeedback = 'Connecting to Telegram MTProto...';
		triggerHaptic();

		try {
			syncFeedback = 'Syncing channel updates...';
			const res = await fetch('/api/sync', { method: 'POST' });
			const rawText = await res.text();
			let result: any = null;
			try {
				result = JSON.parse(rawText);
			} catch (_) {
				// Proxy returned HTML (e.g. 504 Gateway Timeout or 502)
				if (res.status === 504 || res.status === 502 || res.status === 499) {
					syncFeedback = 'Sync running in background... Refreshing timeline.';
					setTimeout(() => {
						window.location.reload();
					}, 1800);
					return;
				}
				throw new Error(`Server returned status ${res.status}`);
			}

			if (!res.ok) {
				throw new Error(result?.error || 'Sync failed');
			}

			syncFeedback = `Synced ${result.syncedChannelsCount} channels (${result.totalMessagesCount} stories)`;
			setTimeout(() => {
				window.location.reload();
			}, 800);
		} catch (err: any) {
			syncFeedback = `Sync: ${err.message}`;
		} finally {
			isSyncing = false;
		}
	}

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

	let channelCounts = $derived.by(() => {
		const map: Record<string, number> = {};
		for (const card of data.dayCards || []) {
			map[card.channelId] = (map[card.channelId] || 0) + card.messageCount;
			map[card.channelName] = (map[card.channelName] || 0) + card.messageCount;
		}
		return map;
	});

	let allGroups = $derived.by(() => {
		let cards = data.dayCards || [];
		if (selectedChannelFilter) {
			cards = cards.filter((c) => c.channelId === selectedChannelFilter);
		}
		if (selectedWeekdays.length > 0) {
			cards = cards.map((c) => ({
				...c,
				messages: c.messages.filter((m) => selectedWeekdays.includes(new Date(m.postedAt).getDay()))
			})).filter((c) => c.messages.length > 0);
		}
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
		if (activeTab === 'starred') {
			cards = cards.map((c) => ({
				...c,
				messages: c.messages.filter((m) => starredIds.has(m.id))
			})).filter((c) => c.messages.length > 0);
		}
		return groupCardsByView(cards, timeView);
	});

	let visibleGroups = $derived(allGroups.slice(0, visibleGroupsCount));
	let visibleChannels = $derived((data.channels || []).slice(0, visibleChannelsCount));

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
					if (!q || (msg.text || '').toLowerCase().includes(q) || card.channelName.toLowerCase().includes(q)) {
						items.push({
							channelName: card.channelName,
							text: msg.text || '',
							postedAt: new Date(msg.postedAt),
							id: msg.id,
							rawMsg: msg
						});
					}
				}
			}
		}
		return items.sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime());
	});

	const weekdaysList = [
		{ day: 1, label: 'Monday', short: 'Mon' },
		{ day: 2, label: 'Tuesday', short: 'Tue' },
		{ day: 3, label: 'Wednesday', short: 'Wed' },
		{ day: 4, label: 'Thursday', short: 'Thu' },
		{ day: 5, label: 'Friday', short: 'Fri' },
		{ day: 6, label: 'Saturday', short: 'Sat' },
		{ day: 0, label: 'Sunday', short: 'Sun' }
	];

	let selectedChannelName = $derived.by(() => {
		if (!selectedChannelFilter) return null;
		const ch = data.channels?.find((c) => c.id === selectedChannelFilter);
		return ch?.name || 'Selected Channel';
	});

	let selectedWeekdaysText = $derived.by(() => {
		if (selectedWeekdays.length === 0) return null;
		if (selectedWeekdays.length === 7) return 'All Days';
		return selectedWeekdays.map((d) => weekdaysList.find((w) => w.day === d)?.short || '').join(', ');
	});
</script>

<svelte:head>
	<title>Sift — Telegram Channel Timeline</title>
	<meta name="description" content="Chronological reader for Telegram channels with zero AI loss." />
	<style>
		@keyframes pulseGlow {
			0%, 100% {
				transform: scale(1);
				box-shadow: 0 0 8px rgba(244, 63, 94, 0.4);
			}
			50% {
				transform: scale(1.15);
				box-shadow: 0 0 16px rgba(244, 63, 94, 0.8);
			}
		}

		@keyframes stringLightTravel {
			0% {
				stroke-dashoffset: 20;
			}
			100% {
				stroke-dashoffset: 0;
			}
		}

		.glowing-string {
			stroke-dasharray: 6 4;
			animation: stringLightTravel 2.5s linear infinite;
		}

		.node-light {
			animation: pulseGlow 2s ease-in-out infinite;
		}

		/* Obsidian Surfaces & Specular Borders */
		.surface-base { background-color: #08080a; }
		.surface-panel { background-color: #0d0e14; border-color: rgba(255, 255, 255, 0.08); }
		.surface-card {
			background: linear-gradient(180deg, rgba(20, 21, 29, 0.7) 0%, rgba(13, 14, 20, 0.85) 100%);
			border: 1px solid rgba(255, 255, 255, 0.07);
			box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
			transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
		}
		.surface-card:hover {
			border-color: rgba(255, 255, 255, 0.14);
			box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 10px 24px -6px rgba(0, 0, 0, 0.5);
		}

		.glass-capsule {
			background: rgba(18, 20, 28, 0.75);
			backdrop-filter: blur(16px);
			-webkit-backdrop-filter: blur(16px);
			border: 1px solid rgba(255, 255, 255, 0.08);
			box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
		}

		/* Custom scrollbar */
		::-webkit-scrollbar { width: 4px; height: 4px; }
		::-webkit-scrollbar-track { background: transparent; }
		::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.12); border-radius: 9999px; }
		::-webkit-scrollbar-thumb:hover { background: rgba(244, 63, 94, 0.5); }
	</style>
</svelte:head>

<div class="flex flex-col md:flex-row h-screen w-full surface-base text-[#e5e7eb] overflow-hidden select-none font-sans">
	
	<!-- 1. LEFT / BOTTOM NAVIGATION DOCK -->
	<aside id="tour-dock-nav" class="order-2 md:order-1 w-full md:w-16 lg:w-60 border-t md:border-t-0 md:border-r border-white/[0.07] bg-[#0b0c12] flex md:flex-col items-center md:items-stretch justify-between shrink-0 z-30 py-2 md:py-4 px-2 md:px-3">
		
		<!-- Top Branding (Desktop) -->
		<div class="hidden md:flex items-center justify-between px-2 pb-4 mb-2 border-b border-white/[0.06]">
			<button
				type="button"
				onclick={clearAllFilters}
				class="flex items-center gap-3 text-left group cursor-pointer"
				title="Sift Home (Reset Filters)"
			>
				<div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#f43f5e] to-[#fb7185] flex items-center justify-center shadow-lg shadow-[#f43f5e]/25 text-white font-bold text-sm group-hover:scale-105 transition-transform">
					<SlidersHorizontal class="w-4 h-4" />
				</div>
				<div class="hidden lg:flex flex-col">
					<span class="text-sm font-bold tracking-tight text-white leading-none">Sift</span>
					<span class="text-[10px] text-[#717684] font-medium tracking-wide">Channel Timeline</span>
				</div>
			</button>
		</div>

		<!-- Main 5 Navigation Tabs -->
		<nav class="w-full flex md:flex-col items-center md:items-stretch justify-around md:justify-start gap-1">
			
			<!-- 1. Timeline Stream -->
			<button
				type="button"
				onclick={() => { activeTab = 'timeline'; triggerHaptic(); }}
				title="Timeline Stream (1)"
				class="flex-1 md:flex-none flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium text-xs {activeTab === 'timeline' ? 'bg-[#f43f5e]/15 text-[#f43f5e] border border-[#f43f5e]/30 shadow-sm' : 'text-[#828796] hover:text-white hover:bg-white/[0.04]'}"
			>
				<SlidersHorizontal class="w-4 h-4 shrink-0" />
				<span class="hidden lg:inline font-semibold">Timeline</span>
				{#if data.isLoggedIn && allGroups.length > 0}
					<span class="hidden lg:inline ml-auto text-[10px] font-mono bg-[#f43f5e]/20 text-[#f43f5e] px-1.5 py-0.5 rounded-md font-bold">{data.stats.messageCount}</span>
				{/if}
			</button>

			<!-- 2. Channels Directory -->
			<button
				type="button"
				onclick={() => { activeTab = 'channels'; triggerHaptic(); }}
				title="Channels Directory (2)"
				class="flex-1 md:flex-none flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium text-xs {activeTab === 'channels' ? 'bg-[#f43f5e]/15 text-[#f43f5e] border border-[#f43f5e]/30 shadow-sm' : 'text-[#828796] hover:text-white hover:bg-white/[0.04]'}"
			>
				<LayoutGrid class="w-4 h-4 shrink-0" />
				<span class="hidden lg:inline">Channels</span>
				{#if data.channels?.length}
					<span class="hidden lg:inline ml-auto text-[10px] font-mono text-[#666a78]">{data.channels.length}</span>
				{/if}
			</button>

			<!-- 3. Starred Stories -->
			<button
				type="button"
				onclick={() => { activeTab = 'starred'; triggerHaptic(); }}
				title="Starred Stories (5)"
				class="flex-1 md:flex-none flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium text-xs {activeTab === 'starred' ? 'bg-[#f43f5e]/15 text-[#f43f5e] border border-[#f43f5e]/30 shadow-sm' : 'text-[#828796] hover:text-white hover:bg-white/[0.04]'}"
			>
				<Star class="w-4 h-4 shrink-0 {starredIds.size > 0 ? 'fill-[#fbbf24] text-[#fbbf24]' : ''}" />
				<span class="hidden lg:inline">Starred</span>
				{#if starredIds.size > 0}
					<span class="hidden lg:inline ml-auto text-[10px] font-mono text-[#fbbf24] bg-[#fbbf24]/15 px-1.5 py-0.5 rounded-md font-bold">{starredIds.size}</span>
				{/if}
			</button>

			<!-- 4. Pulse & Metrics Insights -->
			<button
				type="button"
				onclick={() => { activeTab = 'stats'; triggerHaptic(); }}
				title="Pulse & Insights (3)"
				class="flex-1 md:flex-none flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium text-xs {activeTab === 'stats' ? 'bg-[#f43f5e]/15 text-[#f43f5e] border border-[#f43f5e]/30 shadow-sm' : 'text-[#828796] hover:text-white hover:bg-white/[0.04]'}"
			>
				<BarChart2 class="w-4 h-4 shrink-0" />
				<span class="hidden lg:inline">Insights</span>
			</button>

			<!-- 5. Media Gallery -->
			<button
				type="button"
				onclick={() => { activeTab = 'media'; triggerHaptic(); }}
				title="Media Gallery (4)"
				class="flex-1 md:flex-none flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium text-xs {activeTab === 'media' ? 'bg-[#f43f5e]/15 text-[#f43f5e] border border-[#f43f5e]/30 shadow-sm' : 'text-[#828796] hover:text-white hover:bg-white/[0.04]'}"
			>
				<ImageIcon class="w-4 h-4 shrink-0" />
				<span class="hidden lg:inline">Media</span>
			</button>

			<!-- Mobile Quick Account Button -->
			<button
				type="button"
				onclick={() => { isAccountModalOpen = true; triggerHaptic(); }}
				class="md:hidden flex-1 flex items-center justify-center p-2 text-[#828796] hover:text-white"
				title="Account & Settings"
			>
				<div class="w-7 h-7 rounded-full bg-gradient-to-tr from-rose-500 to-indigo-500 p-[1.5px] relative shrink-0">
					<div class="w-full h-full rounded-full bg-[#0c0d13] flex items-center justify-center text-[10px] font-bold text-white">
						{data.account?.initial || 'T'}
					</div>
					<div class="w-2 h-2 rounded-full bg-emerald-400 border-2 border-[#0c0d13] absolute bottom-0 right-0"></div>
				</div>
			</button>
		</nav>

		<!-- Bottom Account Controls (Desktop) -->
		<div class="hidden md:flex flex-col gap-2 pt-3 border-t border-white/[0.06] mt-auto">
			{#if data.isLoggedIn}
				<button
					id="tour-sync-btn"
					type="button"
					onclick={handleSync}
					disabled={isSyncing}
					class="w-full flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] text-xs text-[#9aa0b0] hover:text-white transition-all disabled:opacity-50 cursor-pointer"
				>
					<RefreshCw class="w-4 h-4 text-[#f43f5e] shrink-0 {isSyncing ? 'animate-spin' : ''}" />
					<span class="hidden lg:inline font-medium">{isSyncing ? 'Syncing...' : 'Sync'}</span>
				</button>

				<button
					type="button"
					onclick={() => { isAccountModalOpen = true; triggerHaptic(); }}
					class="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/[0.04] transition-all text-left cursor-pointer group"
					title="Account Settings"
				>
					<div class="w-8 h-8 rounded-full bg-gradient-to-tr from-rose-500 to-indigo-500 p-[1.5px] relative shrink-0">
						<div class="w-full h-full rounded-full bg-[#0c0d13] flex items-center justify-center text-xs font-bold text-white">
							{data.account?.initial || 'T'}
						</div>
						<div class="w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0c0d13] absolute -bottom-0.5 -right-0.5"></div>
					</div>
					<div class="hidden lg:flex flex-col min-w-0 flex-1 overflow-hidden">
						<span class="text-xs font-semibold text-white truncate block">{data.account?.name || 'Connected'}</span>
						<span class="text-[10px] text-[#6b707f] font-mono truncate block">{data.account?.username ? '@' + data.account.username : 'MTProto Active'}</span>
					</div>
				</button>
			{:else}
				<a
					href="/login"
					class="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[#f43f5e] hover:bg-[#e11d48] text-white text-xs font-semibold shadow-md shadow-[#f43f5e]/20 transition-all"
				>
					<UserCheck class="w-4 h-4" />
					<span class="hidden lg:inline">Connect</span>
				</a>
			{/if}
		</div>

	</aside>

	<!-- 2. MAIN VIEW CANVAS & TOP BAR -->
	<main class="order-1 md:order-2 flex-1 flex flex-col overflow-hidden relative">
		
		<!-- Sticky Top Header -->
		<header class="px-4 sm:px-6 py-3.5 border-b border-white/[0.07] bg-[#0d0e15]/80 backdrop-blur-xl flex items-center justify-between gap-3 shrink-0 z-20">
			
			<!-- Left: Search & Filter Pills -->
			<div class="flex items-center gap-2 sm:gap-3 min-w-0">
				
				<!-- Quick Search / Command Palette Trigger -->
				<button
					id="tour-search-btn"
					type="button"
					onclick={() => { isSearchOpen = !isSearchOpen; if (isSearchOpen) setTimeout(() => document.getElementById('sift-search-input')?.focus(), 50); }}
					class="px-3 py-1.5 rounded-xl bg-[#13151f] hover:bg-[#1a1c28] border border-white/[0.08] text-xs text-[#7e8392] hover:text-white flex items-center gap-2 transition-all cursor-pointer shadow-sm shrink-0"
					title="Quick Search & Command Palette (⌘K or /)"
				>
					<Search class="w-3.5 h-3.5 text-[#f43f5e]" />
					<span class="hidden sm:inline">Search stories, channels...</span>
					<span class="sm:hidden">Search</span>
					<kbd class="hidden md:inline text-[10px] font-mono bg-white/[0.06] border border-white/[0.1] px-1.5 py-0.5 rounded text-[#a6abb8]">⌘K</kbd>
				</button>

				<!-- Time View Switcher (Day / Week / Month) -->
				{#if activeTab === 'timeline' || activeTab === 'starred'}
					<div id="tour-time-switcher" class="flex items-center p-0.5 bg-[#13151f] border border-white/[0.08] rounded-xl text-xs font-medium text-[#7d8290] shrink-0">
						<button
							type="button"
							onclick={() => switchTimeView('day')}
							class="px-3 py-1 rounded-lg transition-all cursor-pointer {timeView === 'day' ? 'bg-[#222533] text-white font-semibold shadow-sm' : 'hover:text-white'}"
							title="Day View (d)"
						>
							Day
						</button>
						<button
							type="button"
							onclick={() => switchTimeView('week')}
							class="px-3 py-1 rounded-lg transition-all cursor-pointer {timeView === 'week' ? 'bg-[#222533] text-white font-semibold shadow-sm' : 'hover:text-white'}"
							title="Week View (w)"
						>
							Week
						</button>
						<button
							type="button"
							onclick={() => switchTimeView('month')}
							class="px-3 py-1 rounded-lg transition-all cursor-pointer {timeView === 'month' ? 'bg-[#222533] text-white font-semibold shadow-sm' : 'hover:text-white'}"
							title="Month View (m)"
						>
							Month
						</button>
					</div>
				{/if}

				<!-- Filter Badges -->
				{#if selectedChannelName || selectedWeekdaysText || searchQuery}
					<div class="hidden lg:flex items-center gap-1.5 overflow-x-auto scrollbar-none">
						{#if selectedChannelName}
							<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#141620] border border-[#38bdf8]/30 text-xs text-[#38bdf8] shrink-0">
								<span class="truncate max-w-[120px]">{selectedChannelName}</span>
								<button type="button" onclick={() => selectChannel(null)} class="text-[#777] hover:text-white cursor-pointer"><X class="w-3 h-3" /></button>
							</div>
						{/if}

						{#if selectedWeekdaysText}
							<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#141620] border border-[#f43f5e]/30 text-xs text-[#f43f5e] shrink-0">
								<span>{selectedWeekdaysText}</span>
								<button type="button" onclick={() => selectedWeekdays = []} class="text-[#777] hover:text-white cursor-pointer"><X class="w-3 h-3" /></button>
							</div>
						{/if}

						<button type="button" onclick={clearAllFilters} class="text-[11px] text-[#717684] hover:text-white underline cursor-pointer shrink-0">Clear</button>
					</div>
				{/if}

			</div>

			<!-- Right: Tour + Sync Action Button -->
			<div class="flex items-center gap-2 shrink-0">
				
				{#if data.isLoggedIn}
					<button
						type="button"
						onclick={startOnboardingTour}
						class="px-2.5 py-1.5 rounded-xl bg-[#13151f] hover:bg-[#1c1e2b] border border-white/[0.08] text-xs text-[#8e93a2] hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
						title="App Tour"
					>
						<Compass class="w-3.5 h-3.5 text-[#fb7185]" />
						<span class="hidden sm:inline">Tour</span>
					</button>

					<button
						type="button"
						onclick={handleSync}
						disabled={isSyncing}
						class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#f43f5e] hover:bg-[#e11d48] text-white transition-all shadow-md shadow-[#f43f5e]/20 disabled:opacity-50 cursor-pointer"
					>
						<RefreshCw class="w-3.5 h-3.5 {isSyncing ? 'animate-spin' : ''}" />
						<span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
					</button>
				{:else}
					<a
						href="/login"
						class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#f43f5e] hover:bg-[#e11d48] text-white transition-all shadow-md shadow-[#f43f5e]/20"
					>
						<UserCheck class="w-3.5 h-3.5" />
						<span>Connect Account</span>
					</a>
				{/if}

			</div>

		</header>

		<!-- Weekday Filter Bar (Shown in Timeline & Starred) -->
		{#if (activeTab === 'timeline' || activeTab === 'starred') && data.isLoggedIn && allGroups.length > 0}
			<div id="tour-weekday-filters" class="px-4 sm:px-6 py-2.5 border-b border-white/[0.06] bg-[#0c0d13]/90 flex items-center justify-between gap-2 overflow-x-auto text-xs">
				<div class="flex items-center gap-1.5 shrink-0">
					<button
						type="button"
						onclick={() => setWeekdayPreset('all')}
						class="px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer {selectedWeekdays.length === 0 ? 'bg-[#222533] text-white font-semibold shadow-sm' : 'bg-white/[0.03] text-[#7d8290] hover:text-white border border-white/[0.06]'}"
					>
						All
					</button>

					{#each weekdaysList as wd}
						{@const isSelected = selectedWeekdays.includes(wd.day)}
						{@const count = weekdayCounts[wd.day] || 0}

						<button
							type="button"
							onclick={() => toggleWeekday(wd.day)}
							class="px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 {isSelected ? 'bg-[#f43f5e] text-white font-semibold shadow-md shadow-[#f43f5e]/20' : 'bg-white/[0.03] text-[#8e93a2] hover:text-white border border-white/[0.06]'}"
							title="{wd.label} ({count} stories)"
						>
							<span>{wd.short}</span>
							{#if count > 0}
								<span class="text-[10px] opacity-75 font-mono">({count})</span>
							{/if}
						</button>
					{/each}
				</div>

				<div class="hidden sm:flex items-center gap-1 shrink-0">
					<button type="button" onclick={() => setWeekdayPreset('weekdays')} class="px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#7d8290] hover:text-white bg-white/[0.03] border border-white/[0.06] cursor-pointer">Mon-Fri</button>
					<button type="button" onclick={() => setWeekdayPreset('weekends')} class="px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#7d8290] hover:text-white bg-white/[0.03] border border-white/[0.06] cursor-pointer">Sat-Sun</button>
				</div>
			</div>
		{/if}

		<!-- Sync Feedback Status Strip -->
		{#if syncFeedback}
			<div class="bg-[#12141e] border-b border-white/[0.08] px-6 py-2 text-xs text-[#a0a5b5] flex items-center justify-between">
				<div class="flex items-center gap-2">
					<div class="w-1.5 h-1.5 rounded-full bg-[#f43f5e] animate-ping"></div>
					<span>{syncFeedback}</span>
				</div>
			</div>
		{/if}

		<!-- VIEW SECTIONS -->
		<div class="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col max-w-5xl mx-auto w-full">
			
			<!-- SCENARIO A: NOT CONNECTED / UNINITIALIZED ONBOARDING HERO -->
			{#if !data.isLoggedIn}
				<div class="w-full max-w-2xl mx-auto my-auto flex flex-col items-center text-center gap-8 py-8">
					
					<div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#f43f5e] to-[#fb7185] flex items-center justify-center text-white shadow-2xl shadow-[#f43f5e]/30">
						<SlidersHorizontal class="w-7 h-7" />
					</div>

					<div class="flex flex-col gap-2 max-w-lg">
						<h1 class="text-xl sm:text-2xl font-bold tracking-tight text-white">
							Telegram Channel Timeline
						</h1>
						<p class="text-xs sm:text-sm text-[#8e93a2] leading-relaxed">
							Sift aggregates updates from your subscribed channels into a clean chronological timeline with zero distortion.
						</p>
					</div>

					<!-- 4 Feature Pillars -->
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full text-left">
						<div class="surface-card rounded-2xl p-4 flex flex-col gap-1.5">
							<div class="flex items-center gap-2 text-[#38bdf8]">
								<CheckCircle class="w-4 h-4" />
								<span class="text-xs font-bold text-white">Chronological Timeline</span>
							</div>
							<p class="text-xs text-[#8e93a2] leading-relaxed">
								Day, Week, and Month chronological views to inspect your channel updates at your preferred pace.
							</p>
						</div>

						<div class="surface-card rounded-2xl p-4 flex flex-col gap-1.5">
							<div class="flex items-center gap-2 text-[#fbbf24]">
								<Sparkles class="w-4 h-4" />
								<span class="text-xs font-bold text-white">100% Script Fidelity</span>
							</div>
							<p class="text-xs text-[#8e93a2] leading-relaxed">
								Full Amharic, Ge'ez, Arabic, and Latin multi-lingual script rendering without alteration.
							</p>
						</div>

						<div class="surface-card rounded-2xl p-4 flex flex-col gap-1.5">
							<div class="flex items-center gap-2 text-emerald-400">
								<CheckCircle2 class="w-4 h-4" />
								<span class="text-xs font-bold text-white">View-Time Badge Sync</span>
							</div>
							<p class="text-xs text-[#8e93a2] leading-relaxed">
								Opening channels in Sift clears Telegram's native notification badge counts.
							</p>
						</div>

						<div class="surface-card rounded-2xl p-4 flex flex-col gap-1.5">
							<div class="flex items-center gap-2 text-[#f43f5e]">
								<ShieldCheck class="w-4 h-4" />
								<span class="text-xs font-bold text-white">Private & Sandboxed</span>
							</div>
							<p class="text-xs text-[#8e93a2] leading-relaxed">
								End-to-end MTProto encrypted session with instant 1-click account and session wipe.
							</p>
						</div>
					</div>

					<!-- Big Connect CTA -->
					<a
						href="/login"
						class="px-8 py-3.5 rounded-2xl bg-[#f43f5e] hover:bg-[#e11d48] text-white text-sm font-semibold shadow-xl shadow-[#f43f5e]/25 transition-all hover:scale-105 flex items-center gap-2.5"
					>
						<UserCheck class="w-4 h-4" />
						<span>Connect Telegram Account</span>
					</a>

				</div>

			<!-- SCENARIO B: LOGGED IN & TIMELINE STREAM -->
			{:else if activeTab === 'timeline' || activeTab === 'starred'}
				
				{#if isSyncing}
					<!-- Shimmer Loading Skeletons -->
					<div class="flex flex-col gap-6 animate-pulse">
						{#each [1, 2] as _section}
							<div class="flex flex-col gap-4">
								<div class="h-8 w-64 bg-white/[0.05] rounded-xl"></div>
								<div class="surface-card rounded-2xl p-5 flex flex-col gap-3">
									<div class="flex items-center justify-between">
										<div class="h-4 w-32 bg-white/[0.08] rounded-full"></div>
										<div class="h-3 w-16 bg-white/[0.04] rounded"></div>
									</div>
									<div class="h-4 w-full bg-white/[0.06] rounded"></div>
									<div class="h-4 w-5/6 bg-white/[0.04] rounded"></div>
									<div class="h-32 w-full bg-white/[0.04] rounded-xl mt-2"></div>
								</div>
							</div>
						{/each}
					</div>

				{:else if allGroups.length === 0}
					<!-- ALL CAUGHT UP / EMPTY ZERO-INBOX STATE -->
					<div class="w-full max-w-lg mx-auto surface-card rounded-3xl p-8 flex flex-col items-center text-center gap-5 my-auto">
						<div class="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
							{#if activeTab === 'starred'}
								<Star class="w-6 h-6 text-[#fbbf24]" />
							{:else}
								<CheckCircle2 class="w-6 h-6" />
							{/if}
						</div>

						<div class="flex flex-col gap-1.5">
							<h2 class="text-base font-bold text-white tracking-tight">
								{#if activeTab === 'starred'}
									No Starred Stories Yet
								{:else if selectedChannelFilter || selectedWeekdays.length > 0 || searchQuery}
									No Stories Match Filters
								{:else}
									All Caught Up!
								{/if}
							</h2>
							<p class="text-xs text-[#8e93a2] leading-relaxed">
								{#if activeTab === 'starred'}
									Click the star icon (★) on any story card to save it here for quick reference.
								{:else if selectedChannelFilter || selectedWeekdays.length > 0 || searchQuery}
									Try clearing your search query or selecting additional days of the week.
								{:else}
									You are completely up to date across all your tracked channels!
								{/if}
							</p>
						</div>

						{#if selectedChannelFilter || selectedWeekdays.length > 0 || searchQuery}
							<button
								type="button"
								onclick={clearAllFilters}
								class="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-white transition-all cursor-pointer"
							>
								Clear All Filters
							</button>
						{:else}
							<button
								type="button"
								onclick={handleSync}
								disabled={isSyncing}
								class="px-5 py-2.5 rounded-xl bg-[#f43f5e] hover:bg-[#e11d48] text-xs font-semibold text-white transition-all shadow-md shadow-[#f43f5e]/20 flex items-center gap-2 cursor-pointer"
							>
								<RefreshCw class="w-3.5 h-3.5 {isSyncing ? 'animate-spin' : ''}" />
								<span>Sync Latest Stories</span>
							</button>
						{/if}
					</div>

				{:else}
					<!-- CHRONOLOGICAL TIME STREAM -->
					<div class="relative flex flex-col pl-4 sm:pl-6">
						{#each visibleGroups as group, groupIndex (group.id)}
							{@const isLastGroup = groupIndex === visibleGroups.length - 1}
							{@const maxMsgLimit = expandedGroupLimits[group.id] || 10}
							{@const visibleMessages = group.messages.slice(0, maxMsgLimit)}
							{@const hasMoreInGroup = group.messages.length > maxMsgLimit}

							<div class="relative flex flex-col pb-8 last:pb-2">
								
								<!-- Sticky Date Header Capsule -->
								<div class="sticky top-0 z-10 flex items-center justify-between px-4 py-2 rounded-2xl glass-capsule mb-4">
									<div class="flex items-center gap-2.5">
										<div class="w-2.5 h-2.5 rounded-full {group.isToday ? 'bg-[#f43f5e] node-light' : 'bg-[#6b7080]'}"></div>
										<span class="text-xs sm:text-sm font-bold text-white tracking-tight">{group.formattedDate}</span>
										<span class="text-[11px] text-[#7d8290] font-mono">({group.messages.length} {group.messages.length === 1 ? 'story' : 'stories'})</span>
									</div>
									<div class="flex items-center gap-2 text-[11px] text-[#8e93a2] font-medium">
										<span>⏱ ~{Math.max(1, Math.round(group.messages.length * 0.3))} min read</span>
									</div>
								</div>

								<!-- Story Cards in Date Node -->
								<div class="flex flex-col gap-3.5 pl-3 border-l border-white/[0.08] ml-2">
									{#each visibleMessages as msg (msg.id)}
										{@const isStarred = starredIds.has(msg.id)}
										{@const chColor = getChannelColor(msg.channelName)}
										{@const isLongText = (msg.text || '').length > 280}
										{@const isExpanded = expandedStoryIds.has(msg.id)}

										<article
											id="tour-story-item"
											class="story-card-item surface-card rounded-2xl p-4 sm:p-5 flex flex-col gap-3 relative group"
										>
											<!-- Channel Attribution & Quick Action Bar -->
											<div class="flex items-center justify-between">
												<div class="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
													<button
														type="button"
														onclick={() => selectChannel(msg.channelId)}
														class="text-xs font-bold px-2.5 py-0.5 rounded-full border transition-all cursor-pointer truncate max-w-[200px]"
														style="color: {chColor}; background: {chColor}15; border-color: {chColor}30;"
														title="Filter by @{msg.channelName}"
													>
														@{msg.channelName}
													</button>
													<span class="text-[11px] text-[#6b7080] font-mono shrink-0">{formatMessageTime(msg.postedAt)}</span>
												</div>

												<!-- Hover / Touch Actions Bar -->
												<div class="flex items-center gap-1 bg-[#12141e] border border-white/[0.08] rounded-lg p-1 shrink-0 ml-2">
													<button
														type="button"
														onclick={() => toggleStar(msg.id)}
														class="p-1.5 rounded hover:bg-white/[0.08] transition-colors cursor-pointer {isStarred ? 'text-[#fbbf24]' : 'text-[#8e93a2] hover:text-[#fbbf24]'}"
														title="{isStarred ? 'Unstar Story' : 'Bookmark Story (★)'}"
													>
														<Star class="w-3.5 h-3.5 {isStarred ? 'fill-[#fbbf24]' : ''}" />
													</button>

													<button
														type="button"
														onclick={() => openReaderModal(msg.text?.slice(0, 40) || 'Story', msg.channelName, msg.text || '', formatMessageTime(msg.postedAt), chColor)}
														class="p-1.5 rounded hover:bg-white/[0.08] text-[#8e93a2] hover:text-[#f43f5e] transition-colors cursor-pointer"
														title="Open in Zen Focus Reader"
													>
														<BookOpen class="w-3.5 h-3.5" />
													</button>

													<button
														type="button"
														onclick={() => copyText(msg.id, msg.text || '')}
														class="p-1.5 rounded hover:bg-white/[0.08] text-[#8e93a2] hover:text-white transition-colors cursor-pointer"
														title="Copy Raw Text"
													>
														{#if copiedId === msg.id}
															<Check class="w-3.5 h-3.5 text-emerald-400" />
														{:else}
															<Copy class="w-3.5 h-3.5" />
														{/if}
													</button>
												</div>
											</div>

											<!-- Text Content with Read More Truncation -->
											{#if msg.text}
												<div class="flex flex-col gap-1.5">
													<p class="text-xs sm:text-sm text-[#e1e4ec] leading-relaxed whitespace-pre-wrap font-sans">
														{isLongText && !isExpanded ? msg.text.slice(0, 260) + '...' : msg.text}
													</p>
													{#if isLongText}
														<button
															type="button"
															onclick={() => toggleStoryExpand(msg.id)}
															class="self-start text-xs font-semibold text-[#f43f5e] hover:text-[#fb7185] transition-colors cursor-pointer flex items-center gap-1"
														>
															{#if isExpanded}
																<span>Show less</span>
																<ChevronUp class="w-3 h-3" />
															{:else}
																<span>Read more</span>
																<ChevronDown class="w-3 h-3" />
															{/if}
														</button>
													{/if}
												</div>
											{/if}

											<!-- Media Image Stream Attachment (Proxied via MTProto) -->
											{#if msg.hasMedia}
												<div class="relative mt-1">
													<button
														type="button"
														onclick={() => openLightbox(`/api/media/${msg.channelId}/${msg.telegramMessageId}`)}
														class="w-full h-48 sm:h-56 rounded-xl bg-[#151722] border border-white/[0.08] relative overflow-hidden flex items-center justify-center group/img cursor-pointer"
													>
														<img
															src="/api/media/{msg.channelId}/{msg.telegramMessageId}"
															alt="Telegram attachment"
															loading="lazy"
															class="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
															onerror={(e) => {
																const target = e.currentTarget as HTMLImageElement;
																target.style.display = 'none';
																if (target.nextElementSibling) {
																	(target.nextElementSibling as HTMLElement).style.display = 'flex';
																}
															}}
														/>
														<div class="hidden flex-col items-center gap-1.5 text-[#38bdf8]">
															<ImageIcon class="w-7 h-7 opacity-80" />
															<span class="text-xs font-medium text-[#c5cad8]">High-Res Photo Attachment</span>
														</div>
													</button>
												</div>
											{/if}
										</article>
									{/each}

									{#if hasMoreInGroup}
										<button
											type="button"
											onclick={() => {
												expandedGroupLimits[group.id] = (expandedGroupLimits[group.id] || 10) + 15;
											}}
											class="py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs font-medium text-[#a0a5b5] hover:text-white transition-all cursor-pointer text-center"
										>
											Show {group.messages.length - maxMsgLimit} more stories from {group.formattedDate}
										</button>
									{/if}
								</div>

							</div>
						{/each}
					</div>
				{/if}

			<!-- SCENARIO C: CHANNELS DIRECTORY (FIXED OVERLAPPING & RESPONSIVE GRID) -->
			{:else if activeTab === 'channels'}
				<div class="flex flex-col gap-6 w-full min-w-0">
					<div class="flex items-center justify-between">
						<div>
							<h2 class="text-base font-bold text-white tracking-tight">Subscribed Channels</h2>
							<p class="text-xs text-[#8e93a2]">Channels configured in <code class="text-[#f43f5e] font-mono text-[11px]">TRACKED_CHANNELS</code></p>
						</div>
						<span class="text-xs font-mono bg-white/[0.04] border border-white/[0.08] px-3 py-1 rounded-xl text-[#a6abb8]">{data.channels?.length || 0} Channels</span>
					</div>

					<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 w-full min-w-0">
						{#each visibleChannels as channel (channel.id)}
							{@const chColor = getChannelColor(channel.name)}
							{@const msgCount = channelCounts[channel.id] || channelCounts[channel.name] || 0}

							<div class="surface-card rounded-2xl p-4 flex flex-col justify-between gap-3 min-w-0 overflow-hidden w-full">
								<div class="flex items-center justify-between gap-2.5 min-w-0 w-full">
									<div class="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
										<div class="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0" style="background: {chColor}20; color: {chColor}; border: 1px solid {chColor}35;">
											{channel.name.slice(0, 2).toUpperCase()}
										</div>
										<div class="flex flex-col min-w-0 flex-1 overflow-hidden">
											<span class="text-xs font-bold text-white truncate block" title={channel.name}>{channel.name}</span>
											<span class="text-[10px] text-[#6b7080] font-mono truncate block">ID: {channel.id}</span>
										</div>
									</div>
									{#if msgCount > 0}
										<span class="text-[10px] font-mono px-2 py-0.5 rounded-full border text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shrink-0">
											{msgCount}
										</span>
									{/if}
								</div>

								<div class="flex items-center justify-between text-[11px] text-[#8e93a2] pt-2 border-t border-white/[0.06] shrink-0">
									<span>Stories: {msgCount}</span>
									<button
										type="button"
										onclick={() => selectChannel(channel.id)}
										class="text-[#f43f5e] hover:underline font-semibold cursor-pointer shrink-0"
									>
										Filter Channel →
									</button>
								</div>
							</div>
						{/each}
					</div>

					{#if (data.channels?.length || 0) > visibleChannelsCount}
						<button
							type="button"
							onclick={() => visibleChannelsCount += 30}
							class="w-full py-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs font-medium text-[#a0a5b5] hover:text-white transition-all cursor-pointer text-center"
						>
							Show more channels...
						</button>
					{/if}
				</div>

			<!-- SCENARIO D: PULSE & METRICS -->
			{:else if activeTab === 'stats'}
				<div class="flex flex-col gap-6 w-full min-w-0">
					<div>
						<h2 class="text-base font-bold text-white tracking-tight">Channel Pulse & Volume</h2>
						<p class="text-xs text-[#8e93a2]">Posting cadence and activity metrics across your subscribed channels</p>
					</div>

					<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
						<div class="surface-card rounded-2xl p-5 flex flex-col gap-1">
							<span class="text-xs text-[#8e93a2]">Tracked Channels</span>
							<span class="text-2xl font-bold text-white font-mono">{data.stats.channelCount}</span>
							<span class="text-[11px] text-emerald-400 font-mono mt-1">100% MTProto health</span>
						</div>

						<div class="surface-card rounded-2xl p-5 flex flex-col gap-1">
							<span class="text-xs text-[#8e93a2]">Total Stories</span>
							<span class="text-2xl font-bold text-white font-mono">{data.stats.messageCount}</span>
							<span class="text-[11px] text-[#8e93a2] font-mono mt-1">Across {data.stats.dayCount} days</span>
						</div>

						<div class="surface-card rounded-2xl p-5 flex flex-col gap-1">
							<span class="text-xs text-[#8e93a2]">Est. Reading Time</span>
							<span class="text-2xl font-bold text-white font-mono">~{Math.max(1, Math.round(data.stats.messageCount * 0.3))} min</span>
							<span class="text-[11px] text-[#f43f5e] font-mono mt-1">Direct chronological stream</span>
						</div>
					</div>

					<!-- Weekly Cadence Distribution Bar Chart -->
					<div class="surface-card rounded-2xl p-5 flex flex-col gap-4">
						<span class="text-xs font-bold text-white">Daily Story Distribution</span>
						<div class="h-32 flex items-end gap-2 sm:gap-4 pt-4 border-b border-white/[0.08] pb-2">
							{#each weekdaysList as wd}
								{@const count = weekdayCounts[wd.day] || 0}
								{@const heightPercent = Math.min(100, Math.max(8, (count / (Math.max(...Object.values(weekdayCounts)) || 1)) * 100))}

								<div class="flex-1 flex flex-col items-center gap-1.5">
									<div class="w-full bg-[#f43f5e] rounded-t-lg transition-all" style="height: {heightPercent}%;"></div>
									<span class="text-[10px] text-[#6b7080] font-mono">{wd.short}</span>
								</div>
							{/each}
						</div>
					</div>
				</div>

			<!-- SCENARIO E: MEDIA GALLERY -->
			{:else if activeTab === 'media'}
				<div class="flex flex-col gap-6 w-full min-w-0">
					<div>
						<h2 class="text-base font-bold text-white tracking-tight">Channel Photo Wall</h2>
						<p class="text-xs text-[#8e93a2]">Chronological stream of photos and attachments</p>
					</div>

					{#if mediaItems.length === 0}
						<div class="surface-card rounded-3xl p-8 text-center text-xs text-[#8e93a2]">
							No photos found in your current stories backlog.
						</div>
					{:else}
						<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
							{#each mediaItems as item (item.id)}
								{@const chColor = getChannelColor(item.channelName)}
								<button
									type="button"
									onclick={() => openLightbox(`/api/media/${item.rawMsg.channelId}/${item.rawMsg.telegramMessageId}`)}
									class="surface-card rounded-2xl h-44 flex flex-col items-center justify-center p-3 text-center gap-2 group cursor-pointer relative overflow-hidden"
								>
									<img
										src="/api/media/{item.rawMsg.channelId}/{item.rawMsg.telegramMessageId}"
										alt="Photo"
										loading="lazy"
										class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform"
										onerror={(e) => {
											(e.currentTarget as HTMLElement).style.display = 'none';
										}}
									/>
									<div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-2.5 z-10 text-left">
										<span class="text-[10px] font-bold truncate text-white" style="color: {chColor};">@{item.channelName}</span>
										<span class="text-[9px] text-[#9a9ea8] font-mono">{formatMessageTime(item.postedAt)}</span>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

		</div>

	</main>

</div>

<!-- 3. RAYCAST ⌘K SPOTLIGHT COMMAND PALETTE MODAL -->
{#if isSearchOpen}
	<div
		class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
		onclick={(e) => { if (e.target === e.currentTarget) isSearchOpen = false; }}
		onkeydown={(e) => { if (e.key === 'Escape') isSearchOpen = false; }}
		role="button"
		tabindex="0"
		aria-label="Close search modal"
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="w-full max-w-xl surface-panel rounded-2xl p-5 flex flex-col gap-4 border border-white/[0.1] shadow-2xl animate-in fade-in zoom-in-95 duration-150"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="flex items-center gap-3 pb-3 border-b border-white/[0.08]">
				<Search class="w-5 h-5 text-[#f43f5e]" />
				<input
					id="sift-search-input"
					type="text"
					bind:value={searchQuery}
					placeholder="Search stories, @channel, has:photo..."
					class="w-full bg-transparent text-sm text-white placeholder-[#6b7080] focus:outline-none"
				/>
				<button type="button" onclick={() => isSearchOpen = false} class="px-2 py-0.5 rounded bg-white/[0.08] text-xs text-[#a6abb8] font-mono cursor-pointer">ESC</button>
			</div>

			<div class="flex items-center gap-2 overflow-x-auto text-xs">
				<span class="text-[#6b7080]">Quick Filters:</span>
				<button type="button" onclick={() => searchQuery = 'has:photo'} class="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-emerald-400 font-mono cursor-pointer">has:photo</button>
				<button type="button" onclick={() => searchQuery = 'today'} class="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[#38bdf8] font-mono cursor-pointer">today</button>
				<button type="button" onclick={() => { activeTab = 'starred'; isSearchOpen = false; }} class="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[#fbbf24] font-mono cursor-pointer">is:starred</button>
			</div>
		</div>
	</div>
{/if}

<!-- 4. ACCOUNT & SESSION MODAL -->
{#if isAccountModalOpen}
	<div
		class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
		onclick={(e) => { if (e.target === e.currentTarget) isAccountModalOpen = false; }}
		onkeydown={(e) => { if (e.key === 'Escape') isAccountModalOpen = false; }}
		role="button"
		tabindex="0"
		aria-label="Close account modal"
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="w-full max-w-md surface-panel rounded-3xl p-6 flex flex-col gap-5 border border-white/[0.1] shadow-2xl animate-in fade-in zoom-in-95 duration-150"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<div class="w-10 h-10 rounded-full bg-gradient-to-tr from-rose-500 to-indigo-500 p-[1.5px] relative shrink-0">
						<div class="w-full h-full rounded-full bg-[#0c0d13] flex items-center justify-center text-sm font-bold text-white">
							{data.account?.initial || 'T'}
						</div>
					</div>
					<div class="flex flex-col">
						<h3 class="text-sm font-bold text-white">{data.account?.name || 'Connected Account'}</h3>
						<span class="text-xs text-[#6b7080] font-mono">{data.account?.username ? '@' + data.account.username : 'MTProto Active'}</span>
					</div>
				</div>
				<button type="button" onclick={() => isAccountModalOpen = false} class="text-xs text-[#828796] hover:text-white px-2.5 py-1 rounded-lg bg-white/[0.05] cursor-pointer">Close</button>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col">
					<span class="text-[11px] text-[#8e93a2]">Tracked Channels</span>
					<span class="text-sm font-bold text-white font-mono">{data.stats.channelCount} channels</span>
				</div>
				<div class="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col">
					<span class="text-[11px] text-[#8e93a2]">Total Stories</span>
					<span class="text-sm font-bold text-white font-mono">{data.stats.messageCount} stories</span>
				</div>
			</div>

			<div class="flex flex-col gap-2 pt-2 border-t border-white/[0.06]">
				<button
					type="button"
					onclick={() => { isAccountModalOpen = false; startOnboardingTour(); }}
					class="w-full py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-[#c5cad8] transition-all flex items-center justify-center gap-2 cursor-pointer"
				>
					<Compass class="w-3.5 h-3.5 text-[#fb7185]" />
					<span>Replay Spotlight Tour</span>
				</button>
				<button
					type="button"
					onclick={handleLogout}
					class="w-full py-2.5 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-all flex items-center justify-center gap-2 cursor-pointer"
				>
					<LogOut class="w-3.5 h-3.5" />
					<span>Log Out & Wipe Session</span>
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- 5. ZEN FOCUS READER MODAL -->
{#if isZenReaderOpen && zenStory}
	<div
		class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
		onclick={(e) => { if (e.target === e.currentTarget) isZenReaderOpen = false; }}
		onkeydown={(e) => { if (e.key === 'Escape') isZenReaderOpen = false; }}
		role="button"
		tabindex="0"
		aria-label="Close reader modal"
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="w-full max-w-lg surface-panel rounded-3xl p-6 sm:p-8 flex flex-col gap-4 border border-white/[0.1] shadow-2xl animate-in fade-in zoom-in-95 duration-150"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="flex items-center justify-between">
				<span class="text-xs font-bold px-2.5 py-0.5 rounded-full border" style="color: {zenStory.channelColor}; background: {zenStory.channelColor}15; border-color: {zenStory.channelColor}30;">
					@{zenStory.channelName}
				</span>
				<button type="button" onclick={() => isZenReaderOpen = false} class="text-xs text-[#828796] hover:text-white px-2.5 py-1 rounded-lg bg-white/[0.05] cursor-pointer">Close</button>
			</div>

			<p class="text-xs sm:text-sm text-[#e1e4ec] leading-relaxed whitespace-pre-wrap font-sans">
				{zenStory.text}
			</p>
		</div>
	</div>
{/if}

<!-- 6. HIGH RESOLUTION LIGHTBOX MODAL -->
{#if isLightboxOpen && activeLightboxImage}
	<div
		class="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4"
		onclick={(e) => { if (e.target === e.currentTarget) closeLightbox(); }}
		onkeydown={(e) => { if (e.key === 'Escape') closeLightbox(); }}
		role="button"
		tabindex="0"
		aria-label="Close image lightbox"
	>
		<button
			type="button"
			onclick={closeLightbox}
			class="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors z-50"
			title="Close Image (ESC)"
		>
			<X class="w-5 h-5" />
		</button>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<img
			src={activeLightboxImage}
			alt="Full resolution view"
			class="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200"
			onclick={(e) => e.stopPropagation()}
		/>
	</div>
{/if}

<!-- 7. INTERACTIVE SPOTLIGHT ONBOARDING OVERLAY -->
{#if isOnboardingOpen && onboardingTourSteps[onboardingStep]}
	{@const currentStep = onboardingTourSteps[onboardingStep]}

	<div class="fixed inset-0 z-50 pointer-events-none transition-all duration-300">
		<svg
			class="absolute inset-0 w-full h-full pointer-events-auto"
			onclick={finishOnboarding}
			role="button"
			tabindex="0"
			aria-label="Finish Tour"
			onkeydown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') finishOnboarding(); }}
		>
			<defs>
				<mask id="spotlight-mask">
					<rect x="0" y="0" width="100%" height="100%" fill="white" />
					{#if spotlightRect}
						<rect
							x={spotlightRect.left}
							y={spotlightRect.top}
							width={spotlightRect.width}
							height={spotlightRect.height}
							rx="14"
							fill="black"
						/>
					{/if}
				</mask>
			</defs>
			<rect x="0" y="0" width="100%" height="100%" fill="rgba(4, 4, 6, 0.82)" mask="url(#spotlight-mask)" />
		</svg>

		{#if spotlightRect}
			<div
				class="absolute pointer-events-none rounded-2xl border-2 border-[#f43f5e] shadow-[0_0_25px_rgba(244,63,94,0.6)] transition-all duration-300"
				style="top: {spotlightRect.top}px; left: {spotlightRect.left}px; width: {spotlightRect.width}px; height: {spotlightRect.height}px;"
			></div>
		{/if}

		<!-- Floating Target-Anchored Tooltip Card -->
		<div
			class="absolute z-50 pointer-events-auto surface-panel rounded-3xl p-5 sm:p-6 border border-white/[0.12] shadow-2xl flex flex-col gap-3.5 transition-all duration-300"
			style="top: {tooltipStyle.top}px; left: {tooltipStyle.left}px; width: min(380px, calc(100vw - 32px));"
		>
			<div class="flex items-center justify-between">
				<span class="text-[10px] font-mono text-[#f43f5e] uppercase tracking-wider font-bold bg-[#f43f5e]/15 px-2 py-0.5 rounded-full border border-[#f43f5e]/30">{currentStep.badge}</span>
				<button type="button" onclick={finishOnboarding} class="text-xs text-[#8e93a2] hover:text-white px-2 py-0.5 rounded bg-white/[0.05] cursor-pointer">Skip Tour</button>
			</div>

			<div class="flex flex-col gap-1">
				<h3 class="text-sm sm:text-base font-bold text-white tracking-tight">{currentStep.title}</h3>
				<p class="text-xs text-[#a0a5b5] leading-relaxed">{currentStep.description}</p>
			</div>

			<div class="flex items-center justify-between pt-2 border-t border-white/[0.06]">
				<button
					type="button"
					onclick={prevOnboardingStep}
					disabled={onboardingStep === 0}
					class="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30 text-xs text-white font-medium cursor-pointer"
				>
					Back
				</button>
				<button
					type="button"
					onclick={nextOnboardingStep}
					class="px-4 py-1.5 rounded-xl bg-[#f43f5e] hover:bg-[#e11d48] text-xs text-white font-semibold shadow-md shadow-[#f43f5e]/25 cursor-pointer"
				>
					{onboardingStep === onboardingTourSteps.length - 1 ? 'Finish Tour' : 'Next'}
				</button>
			</div>
		</div>
	</div>
{/if}
