import { Hono } from 'hono';

export type Bindings = {
	DB: D1Database;
	MEDIA: R2Bucket;
	RENDER_CACHE: KVNamespace;
	JOBS: Queue;
	AI: Ai;
	COMMENTS: DurableObjectNamespace;
	ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get('/api/health', (c) => c.json({ ok: true, time: Date.now() }));

export default app;
