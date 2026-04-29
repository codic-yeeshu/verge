// `caches.default` is a Cloudflare Workers extension; lib.dom's CacheStorage
// type doesn't expose it, so widen via a typed reference.
export function defaultCache(): Cache {
	return (caches as unknown as { default: Cache }).default;
}

export const POST_CACHE_CONTROL = 'public, max-age=60, s-maxage=300';

export async function invalidatePostCache(slug: string, baseUrl: string): Promise<void> {
	const url = new URL(`/post/${slug}`, baseUrl).toString();
	const ok = await defaultCache().delete(url);
	console.log('[post-cache] invalidate', url, ok ? 'HIT' : 'MISS');
}
