import { env } from 'cloudflare:workers';
import { defineMiddleware } from 'astro:middleware';
import honoApp from './api';

export const onRequest = defineMiddleware((context, next) => {
	const { pathname } = new URL(context.request.url);
	if (pathname.startsWith('/api/')) {
		return honoApp.fetch(context.request, env, context.locals.cfContext);
	}
	return next();
});
