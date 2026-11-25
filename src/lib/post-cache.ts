// `caches.default` is a Cloudflare Workers extension; lib.dom's CacheStorage
// type doesn't expose it, so widen via a typed reference.
export function defaultCache(): Cache {
	return (caches as unknown as { default: Cache }).default;
}

export const POST_CACHE_CONTROL = 'public, max-age=0, must-revalidate, s-maxage=300';

export function postCacheKey(requestUrl: string): Request {
	const u = new URL(requestUrl);
	const normalized = new URL(u.pathname.replace(/\/+$/, '') || '/', u.origin).toString();
	return new Request(normalized, { method: 'GET' });
}

export async function invalidatePostCache(slug: string, baseUrl: string): Promise<void> {
	const url = new URL(`/post/${slug}`, baseUrl).toString();
	const ok = await defaultCache().delete(new Request(url, { method: 'GET' }));
	console.log('[post-cache] invalidate', url, ok ? 'HIT' : 'MISS');
}
