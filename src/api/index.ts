import { Hono } from 'hono';
import { type AuthVariables, authMiddleware } from '../lib/auth';
import authRoutes from './routes/auth';
import postsRoutes from './routes/posts';
import roomRoutes from './routes/room';
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
};

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

app.use('*', authMiddleware);

app.get('/api/health', (c) => c.json({ ok: true, time: Date.now() }));

app.get('/api/me', (c) => c.json({ user: c.get('user') }));

app.route('/api/auth', authRoutes);
app.route('/api/posts', postsRoutes);
app.route('/api/upload', uploadRoutes);
app.route('/api/room', roomRoutes);

export default app;
