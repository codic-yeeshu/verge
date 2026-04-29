import { Hono } from 'hono';
import { type AuthVariables, authMiddleware } from '../lib/auth';
import { logEvent } from '../lib/log';
import authRoutes from './routes/auth';
import geoRoutes from './routes/geo';
import postsRoutes from './routes/posts';
import r2Routes from './routes/r2';
import roomRoutes from './routes/room';
import subscribeRoutes from './routes/subscribe';
import uploadRoutes from './routes/upload';

export type Bindings = {
	DB: D1Database;
	MEDIA: R2Bucket;
	RENDER_CACHE: KVNamespace;
	JOBS: Queue;
	AI: Ai;
	COMMENTS: DurableObjectNamespace;
	ASSETS: Fetcher;
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	PUBLIC_BASE_URL: string;
	RESEND_API_KEY?: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

app.use('*', authMiddleware);

app.get('/api/health', (c) => c.json({ ok: true, time: Date.now() }));

app.get('/api/me', (c) => c.json({ user: c.get('user') }));

app.route('/api/auth', authRoutes);
app.route('/api/posts', postsRoutes);
app.route('/api/upload', uploadRoutes);
app.route('/api/room', roomRoutes);
app.route('/api/geo', geoRoutes);
app.route('/api/subscribe', subscribeRoutes);
app.route('/api/r2', r2Routes);

app.onError((err, c) => {
	logEvent('error', {
		path: new URL(c.req.url).pathname,
		method: c.req.method,
		message: err instanceof Error ? err.message : String(err),
		stack: err instanceof Error ? err.stack : undefined,
	});
	return c.json({ error: 'internal_error' }, 500);
});

export default app;
