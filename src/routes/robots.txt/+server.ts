import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	const origin = url.origin;
	return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /login\n\nSitemap: ${origin}/sitemap.xml\n`, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
	});
};
