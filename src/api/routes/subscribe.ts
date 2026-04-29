import { Hono } from 'hono';
import { getDb } from '../../db/client';
import { subscribers } from '../../db/schema';
import type { AuthVariables } from '../../lib/auth';
import { logEvent } from '../../lib/log';
import type { Bindings } from '../index';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;

const subscribe = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

subscribe.post('/', async (c) => {
	let email: string | undefined;
	const ct = c.req.header('content-type') ?? '';
	if (ct.includes('application/json')) {
		const body = await c.req.json<{ email?: string }>().catch(() => ({}));
		email = body.email;
	} else {
		const form = await c.req.formData().catch(() => null);
		email = form?.get('email')?.toString();
	}

	const normalized = email?.trim().toLowerCase();
	if (!normalized || normalized.length > EMAIL_MAX || !EMAIL_RE.test(normalized)) {
		return c.json({ error: 'invalid_email' }, 400);
	}

	const db = getDb(c.env);
	await db.insert(subscribers).values({ email: normalized }).onConflictDoNothing();

	logEvent('subscribe', { email: normalized });
	return c.json({ ok: true });
});

export default subscribe;
