import { Hono } from 'hono';
import type { AuthVariables } from '../../lib/auth';
import type { Bindings } from '../index';

const geo = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

geo.get('/', (c) => {
	const cf = (c.req.raw as { cf?: { country?: string; city?: string; timezone?: string } }).cf;
	return c.json({
		country: cf?.country ?? null,
		city: cf?.city ?? null,
		timezone: cf?.timezone ?? null,
	});
});

export default geo;
