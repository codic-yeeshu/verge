import { env } from 'cloudflare:workers';
import { defineMiddleware } from 'astro:middleware';
import honoApp from './api';
import { getDb } from './db/client';
import { SESSION_COOKIE, validateSession } from './lib/auth';

export const onRequest = defineMiddleware(async (context, next) => {
	const { pathname } = new URL(context.request.url);

	if (pathname.startsWith('/api/')) {
		return honoApp.fetch(context.request, env, context.locals.cfContext);
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
