import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { AuthVariables } from '../../lib/auth';
import type { Bindings } from '../index';

const MAX_BYTES = 8 * 1024 * 1024;

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

app.post('/', async (c) => {
	const user = c.get('user');
	if (!user) return c.json({ error: 'unauthorized' }, 401);

	let formData: FormData;
	try {
		formData = await c.req.formData();
	} catch {
		return c.json({ error: 'invalid_multipart' }, 400);
	}

	const file = formData.get('file');
	if (!(file instanceof File)) {
		return c.json({ error: 'file_required' }, 400);
	}
	if (file.size > MAX_BYTES) {
		return c.json({ error: 'file_too_large', maxBytes: MAX_BYTES }, 413);
	}

	const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'upload';
	const key = `covers/${user.id}/${nanoid(8)}-${safeName}`;

	await c.env.MEDIA.put(key, file.stream(), {
		httpMetadata: {
			contentType: file.type || 'application/octet-stream',
		},
	});

	return c.json({ key });
});

export default app;
