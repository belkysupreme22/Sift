<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';

	let { children, data } = $props();

	onMount(() => {
		// Initialize Telegram Mini App SDK if running inside Telegram
		if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
			const tg = window.Telegram.WebApp;
			tg.ready();
			tg.expand();
			
			// Try to enable closing confirmation for smoother experience
			try {
				if ((tg as any).enableClosingConfirmation) {
					(tg as any).enableClosingConfirmation();
				}
			} catch (_) {}
		}
	});
</script>

<svelte:head>
	<title>Sift — Telegram Channel Timeline</title>
	<meta name="description" content="Sift turns your Telegram channel subscriptions into a clean, chronological timeline. Read complete, unedited stories with powerful search, filters, bookmarks, media browsing, and activity metrics." />
	<meta name="keywords" content="Telegram channel reader, Telegram timeline, chronological feed, Telegram Mini App, channel aggregator, noise-free reading, Telegram archive" />
	{#if data.pathname !== '/login'}
		<link rel="canonical" href={`${data.siteUrl}${data.pathname === '/' ? '' : data.pathname}`} />
	{/if}
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Sift" />
	<meta property="og:title" content="Sift — Your Telegram channels, in chronological order" />
	<meta property="og:description" content="A minimalist Telegram channel timeline that preserves every story in full, without algorithmic noise or rewriting." />
	<meta property="og:url" content={data.siteUrl} />
	<meta property="og:image" content={`${data.siteUrl}/sift-icon.svg`} />
	<meta property="og:image:alt" content="Sift chronological Telegram timeline icon" />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="Sift — Telegram Channel Timeline" />
	<meta name="twitter:description" content="Read your Telegram channels as a clean, chronological timeline with zero AI loss." />
	<meta name="twitter:image" content={`${data.siteUrl}/sift-icon.svg`} />
	<meta name="theme-color" content="#0d0d0d" />
	<script type="application/ld+json">{JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'WebApplication',
		name: 'Sift',
		url: data.siteUrl,
		description: 'A minimalist chronological reader for Telegram channel updates.',
		applicationCategory: 'NewsApplication',
		operatingSystem: 'Web, Telegram',
		browserRequirements: 'Requires JavaScript',
		featureList: ['Chronological Telegram timeline', 'Full unedited text preservation', 'Channel and weekday filters', 'Fuzzy search', 'Bookmarks', 'Media gallery', 'Activity metrics'],
		inLanguage: ['en', 'am', 'ar']
	})}</script>
</svelte:head>

<div class="min-h-screen bg-[#0b0c0e] text-zinc-100 flex flex-col selection:bg-indigo-500 selection:text-white">
	{@render children()}
</div>
