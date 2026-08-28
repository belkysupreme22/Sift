// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		Telegram?: {
			WebApp?: {
				ready: () => void;
				expand: () => void;
				close: () => void;
				initData: string;
				initDataUnsafe: any;
				themeParams: any;
				isExpanded: boolean;
				viewportHeight: number;
				HapticFeedback?: {
					impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
					notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
					selectionChanged: () => void;
				};
			};
		};
	}
}

export {};
