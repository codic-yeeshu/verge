import { Hono } from 'hono';
import type { AuthVariables } from '../../lib/auth';
import type { Bindings } from '../index';

const r2 = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

r2.get('/:key{.+}', async (c) => {
	const key = c.req.param('key');
	if (!key) return c.json({ error: 'no_key' }, 400);

	const obj = await c.env.MEDIA.get(key);
	if (!obj) return c.notFound();

	const headers = new Headers();
	obj.writeHttpMetadata(headers);
	headers.set('etag', obj.httpEtag);
	headers.set('cache-control', 'public, max-age=31536000, immutable');

	return new Response(obj.body, { headers });
});

export default r2;
