import type { LayoutServerLoad } from './$types';
import { env } from '$env/dynamic/private';

/** Public origin used for canonical URLs and social previews. */
export const load: LayoutServerLoad = ({ url }) => {
	const configured = (env.WEBAPP_URL || '').trim().replace(/\/$/, '');
	const siteUrl = configured && /^https?:\/\//i.test(configured) ? configured : url.origin;
	return { siteUrl, pathname: url.pathname };
};
