/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				surface: {
					950: '#090909',
					900: '#0d0d0d',
					850: '#141414',
					800: '#1c1c1c',
					750: '#242424',
					700: '#2e2e2e',
					600: '#3d3d3d'
				},
				accent: {
					pink: '#f43f5e',
					coral: '#fb7185'
				}
			},
			fontFamily: {
				sans: ['Lexend', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
				mono: ['JetBrains Mono', 'Fira Code', 'monospace']
			}
		}
	},
	plugins: []
};
