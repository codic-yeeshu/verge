import { env } from 'cloudflare:workers';
import { defineMiddleware } from 'astro:middleware';
import honoApp from './api';
import { getDb } from './db/client';
import { SESSION_COOKIE, validateSession } from './lib/auth';
import { POST_CACHE_CONTROL, defaultCache } from './lib/post-cache';

export const onRequest = defineMiddleware(async (context, next) => {
	const { pathname } = new URL(context.request.url);

	if (pathname.startsWith('/api/')) {
		return honoApp.fetch(context.request, env, context.locals.cfContext);
	}

	if (pathname.startsWith('/post/') && context.request.method === 'GET') {
		return cachePostPage(context, next);
	}

	const sessionId = context.cookies.get(SESSION_COOKIE)?.value;
	if (sessionId) {
		const result = await validateSession(getDb(env), sessionId);
		context.locals.user = result?.user ?? null;
	} else {
		context.locals.user = null;
	}

	return next();
});

async function cachePostPage(
	context: Parameters<Parameters<typeof defineMiddleware>[0]>[0],
	next: Parameters<Parameters<typeof defineMiddleware>[0]>[1],
): Promise<Response> {
	context.locals.user = null;

	const cache = defaultCache();
	const cached = await cache.match(context.request);
	if (cached) {
		console.log('[post-cache] HIT', context.request.url);
		const headers = new Headers(cached.headers);
		headers.set('x-cache', 'HIT');
		return new Response(cached.body, { status: cached.status, headers });
	}

	console.log('[post-cache] MISS', context.request.url);
	const response = await next();
	const ct = response.headers.get('content-type') ?? '';
	if (!response.ok || !ct.includes('text/html')) {
		return response;
	}

	const headers = new Headers(response.headers);
	headers.set('cache-control', POST_CACHE_CONTROL);

	const buffered = new Response(response.body, { status: response.status, headers });
	const forCache = buffered.clone();
	context.locals.cfContext.waitUntil(cache.put(context.request, forCache));

	const clientHeaders = new Headers(headers);
	clientHeaders.set('x-cache', 'MISS');
	return new Response(buffered.body, { status: response.status, headers: clientHeaders });
}
