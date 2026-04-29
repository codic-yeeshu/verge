const CACHE_HEADERS = {
	'content-type': 'text/html; charset=utf-8',
	'cache-control': 'public, max-age=60, s-maxage=300',
};

// `caches.default` is a Cloudflare Workers extension; lib.dom's CacheStorage
// type doesn't know about it, so widen via a typed reference.
function defaultCache(): Cache {
	return (caches as unknown as { default: Cache }).default;
}

export async function getCachedPost(
	request: Request,
	_env: Env,
	ctx: ExecutionContext,
	renderFn: () => Promise<string | null>,
): Promise<Response> {
	const cache = defaultCache();

	const cached = await cache.match(request);
	if (cached) {
		console.log('[post-cache] HIT', request.url);
		const headers = new Headers(cached.headers);
		headers.set('x-cache', 'HIT');
		return new Response(cached.body, { status: cached.status, headers });
	}

	console.log('[post-cache] MISS', request.url);
	const html = await renderFn();
	if (html === null) {
		return new Response('Not found', { status: 404 });
	}

	const response = new Response(html, {
		headers: { ...CACHE_HEADERS, 'x-cache': 'MISS' },
	});

	ctx.waitUntil(cache.put(request, response.clone()));
	return response;
}

export async function invalidatePostCache(slug: string, baseUrl: string): Promise<void> {
	const url = new URL(`/post/${slug}`, baseUrl).toString();
	const ok = await defaultCache().delete(url);
	console.log('[post-cache] invalidate', url, ok ? 'HIT' : 'MISS');
}
