import { Hono } from 'hono';
import type { AuthVariables } from '../../lib/auth';
import type { Bindings } from '../index';

const room = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

room.get('/:postId', (c) => {
	const postId = c.req.param('postId');
	const id = c.env.COMMENTS.idFromName(postId);
	const stub = c.env.COMMENTS.get(id);
	return stub.fetch(c.req.raw);
});

export default room;
