<script lang="ts">
	import { ArrowRight, CheckCircle2, Lock, Phone, ShieldCheck, ArrowLeft } from 'lucide-svelte';

	let step = $state<'phone' | 'code' | 'password' | 'done'>('phone');
	let phoneNumber = $state('');
	let phoneCode = $state('');
	let password = $state('');
	let loading = $state(false);
	let errorMessage = $state('');

	async function sendCode() {
		if (!phoneNumber.trim()) return;
		loading = true;
		errorMessage = '';

		try {
			await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
			const res = await fetch('/api/auth/send-code', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ phoneNumber: phoneNumber.trim() })
			});

			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error || 'Failed to send code');
			}

			step = 'code';
		} catch (err: any) {
			errorMessage = err.message || 'Failed to send verification code';
		} finally {
			loading = false;
		}
	}

	async function verifyCode() {
		if (!phoneCode.trim()) return;
		loading = true;
		errorMessage = '';

		try {
			const res = await fetch('/api/auth/sign-in', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					phoneNumber: phoneNumber.trim(),
					phoneCode: phoneCode.trim()
				})
			});

			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error || 'Verification failed');
			}

			if (data.requires2FA) {
				step = 'password';
				return;
			}

			step = 'done';
			setTimeout(() => {
				window.location.href = '/';
			}, 1200);
		} catch (err: any) {
			errorMessage = err.message || 'Invalid code or sign-in failed';
		} finally {
			loading = false;
		}
	}

	async function verifyPassword() {
		if (!password) return;
		loading = true;
		errorMessage = '';

		try {
			const res = await fetch('/api/auth/sign-in', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					phoneNumber: phoneNumber.trim(),
					password: password
				})
			});

			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error || 'Password verification failed');
			}

			step = 'done';
			setTimeout(() => {
				window.location.href = '/';
			}, 1200);
		} catch (err: any) {
			errorMessage = err.message || 'Incorrect password';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Connect Telegram — Sift</title>
	<meta name="description" content="Securely connect your Telegram account to Sift and read your subscribed channels in a clean chronological timeline." />
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-[#0d0d0d] text-[#e0e0e0] flex flex-col justify-between p-6 font-['Lexend',sans-serif]">
	<!-- Header -->
	<header class="flex items-center justify-between max-w-md w-full mx-auto">
		<a href="/" class="flex items-center gap-2.5 text-white hover:text-[#cccccc] transition-colors">
			<div class="w-6 h-6 rounded-md border border-[#3a3a3a] flex items-center justify-center">
				<div class="w-2 h-2 rounded-sm bg-[#f43f5e]"></div>
			</div>
			<span class="text-sm font-semibold tracking-tight">Sift</span>
		</a>

		<button
			type="button"
			onclick={() => {
				if (step === 'code' || step === 'password') {
					step = 'phone';
					errorMessage = '';
				} else {
					window.location.href = '/';
				}
			}}
			class="text-xs text-[#777777] hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#141414] hover:bg-[#1f1f1f] border border-[#222222] transition-all cursor-pointer"
		>
			<ArrowLeft class="w-3.5 h-3.5" />
			<span>{step === 'code' || step === 'password' ? 'Change Phone' : 'Back to Timeline'}</span>
		</button>
	</header>

	<!-- Center Form Card -->
	<main class="w-full max-w-md mx-auto my-auto py-10">
		<div class="bg-[#141414] border border-[#222222] rounded-3xl p-7 sm:p-9 flex flex-col gap-6 shadow-2xl">
			<div class="flex flex-col gap-1.5">
				<h1 class="text-lg font-semibold text-white tracking-tight">
					{#if step === 'phone'}
						Connect Account
					{:else if step === 'code'}
						Enter Verification Code
					{:else if step === 'password'}
						Two-Step Verification
					{:else if step === 'done'}
						Connected
					{/if}
				</h1>
				<p class="text-xs text-[#888888] leading-relaxed">
					{#if step === 'phone'}
						Sign in directly via Telegram MTProto to index your subscribed channels.
					{:else if step === 'code'}
						A 5-digit code was sent to your official Telegram app.
					{:else if step === 'password'}
						Enter your cloud password to complete authentication.
					{:else if step === 'done'}
						Your session is active. Redirecting to timeline...
					{/if}
				</p>
			</div>

			{#if errorMessage}
				<div class="px-4 py-3 rounded-2xl bg-[#1e1416] border border-[#f43f5e]/30 text-xs text-[#fb7185] leading-relaxed">
					{errorMessage}
				</div>
			{/if}

			{#if step === 'phone'}
				<form onsubmit={(e) => { e.preventDefault(); sendCode(); }} class="flex flex-col gap-4">
					<div class="flex flex-col gap-2">
						<label for="phone" class="text-xs font-medium text-[#aaaaaa] flex items-center gap-1.5">
							<Phone class="w-3.5 h-3.5 text-[#f43f5e]" />
							Phone Number
						</label>
						<input
							id="phone"
							type="tel"
							bind:value={phoneNumber}
							placeholder="+251911223344"
							class="w-full bg-[#1c1c1c] border border-[#2d2d2d] rounded-2xl px-4 py-3 text-xs text-white placeholder-[#555555] focus:outline-none focus:border-[#f43f5e] transition-colors"
							required
						/>
						<span class="text-[11px] text-[#666666]">Include international country code prefix</span>
					</div>

					<button
						type="submit"
						disabled={loading}
						class="w-full bg-[#f43f5e] hover:bg-[#e11d48] disabled:opacity-50 text-white rounded-2xl py-3 text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#f43f5e]/20 cursor-pointer"
					>
						{#if loading}
							<span>Sending code...</span>
						{:else}
							<span>Continue</span>
							<ArrowRight class="w-3.5 h-3.5" />
						{/if}
					</button>
				</form>

			{:else if step === 'code'}
				<form onsubmit={(e) => { e.preventDefault(); verifyCode(); }} class="flex flex-col gap-4">
					<div class="flex flex-col gap-2">
						<label for="otp" class="text-xs font-medium text-[#aaaaaa] flex items-center gap-1.5">
							<ShieldCheck class="w-3.5 h-3.5 text-[#f43f5e]" />
							Telegram Code
						</label>
						<input
							id="otp"
							type="text"
							bind:value={phoneCode}
							placeholder="12345"
							class="w-full bg-[#1c1c1c] border border-[#2d2d2d] rounded-2xl px-4 py-3 text-base tracking-widest text-center font-mono text-white placeholder-[#444444] focus:outline-none focus:border-[#f43f5e] transition-colors"
							required
						/>
						<div class="flex items-center justify-between text-[11px] text-[#666666]">
							<span>Check messages in Telegram app</span>
							<button type="button" onclick={() => step = 'phone'} class="text-[#888888] hover:text-white cursor-pointer">Change phone</button>
						</div>
					</div>

					<button
						type="submit"
						disabled={loading}
						class="w-full bg-[#f43f5e] hover:bg-[#e11d48] disabled:opacity-50 text-white rounded-2xl py-3 text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#f43f5e]/20 cursor-pointer"
					>
						{#if loading}
							<span>Verifying...</span>
						{:else}
							<span>Confirm & Connect</span>
							<ArrowRight class="w-3.5 h-3.5" />
						{/if}
					</button>
				</form>

			{:else if step === 'password'}
				<form onsubmit={(e) => { e.preventDefault(); verifyPassword(); }} class="flex flex-col gap-4">
					<div class="flex flex-col gap-2">
						<label for="pwd" class="text-xs font-medium text-[#aaaaaa] flex items-center gap-1.5">
							<Lock class="w-3.5 h-3.5 text-[#f43f5e]" />
							2FA Password
						</label>
						<input
							id="pwd"
							type="password"
							bind:value={password}
							placeholder="Telegram Cloud Password"
							class="w-full bg-[#1c1c1c] border border-[#2d2d2d] rounded-2xl px-4 py-3 text-xs text-white placeholder-[#555555] focus:outline-none focus:border-[#f43f5e] transition-colors"
							required
						/>
					</div>

					<button
						type="submit"
						disabled={loading}
						class="w-full bg-[#f43f5e] hover:bg-[#e11d48] disabled:opacity-50 text-white rounded-2xl py-3 text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#f43f5e]/20 cursor-pointer"
					>
						{#if loading}
							<span>Checking...</span>
						{:else}
							<span>Submit Password</span>
							<ArrowRight class="w-3.5 h-3.5" />
						{/if}
					</button>
				</form>

			{:else if step === 'done'}
				<div class="text-center py-4 flex flex-col items-center gap-3">
					<div class="w-12 h-12 rounded-2xl bg-[#1e1416] border border-[#f43f5e]/30 text-[#f43f5e] flex items-center justify-center">
						<CheckCircle2 class="w-6 h-6" />
					</div>
					<h2 class="text-sm font-semibold text-white">Connection Established</h2>
					<p class="text-xs text-[#888888]">Entering Sift Timeline...</p>
				</div>
			{/if}
		</div>
	</main>

	<!-- Footer -->
	<footer class="text-center text-[11px] text-[#444444] max-w-md w-full mx-auto">
		Sift Direct Telegram MTProto Auth
	</footer>
</div>
