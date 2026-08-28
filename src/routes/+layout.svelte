<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';

	let { children } = $props();

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
</svelte:head>

<div class="min-h-screen bg-[#0b0c0e] text-zinc-100 flex flex-col selection:bg-indigo-500 selection:text-white">
	{@render children()}
</div>
