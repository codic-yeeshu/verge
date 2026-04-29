import { and, desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { getDb } from '../../db/client';
import { posts, users } from '../../db/schema';
import type { AuthVariables } from '../../lib/auth';
import type { Bindings } from '../index';

function slugify(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80) || 'post';
}

interface CreatePostBody {
	title?: string;
	bodyMd?: string;
	coverR2Key?: string;
}

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

app.post('/', async (c) => {
	const user = c.get('user');
	if (!user) return c.json({ error: 'unauthorized' }, 401);

	const body = await c.req.json<CreatePostBody>();
	const title = body.title?.trim();
	const bodyMd = body.bodyMd?.trim();
	if (!title || !bodyMd) {
		return c.json({ error: 'title_and_body_required' }, 400);
	}

	const id = nanoid(12);
	const slug = `${slugify(title)}-${id.slice(0, 6)}`;

	const db = getDb(c.env);
	await db.insert(posts).values({
		id,
		slug,
		authorId: user.id,
		title,
		bodyMd,
		coverR2Key: body.coverR2Key ?? null,
		status: 'processing',
	});

	await c.env.JOBS.send({ type: 'process_post', postId: id });

	return c.json({ postId: id, slug, status: 'processing' as const }, 202);
});

app.get('/', async (c) => {
	const db = getDb(c.env);
	const list = await db
		.select({
			id: posts.id,
			slug: posts.slug,
			title: posts.title,
			summary: posts.summary,
			publishedAt: posts.publishedAt,
			authorName: users.name,
		})
		.from(posts)
		.innerJoin(users, eq(users.id, posts.authorId))
		.where(eq(posts.status, 'published'))
		.orderBy(desc(posts.publishedAt))
		.limit(20);

	return c.json({ posts: list });
});

app.get('/:id/status', async (c) => {
	const user = c.get('user');
	if (!user) return c.json({ error: 'unauthorized' }, 401);

	const id = c.req.param('id');
	const db = getDb(c.env);
	const rows = await db
		.select({
			status: posts.status,
			summary: posts.summary,
			tagsJson: posts.tagsJson,
			authorId: posts.authorId,
			slug: posts.slug,
		})
		.from(posts)
		.where(eq(posts.id, id))
		.limit(1);

	const row = rows[0];
	if (!row) return c.json({ error: 'not_found' }, 404);
	if (row.authorId !== user.id) return c.json({ error: 'forbidden' }, 403);

	let tags: string[] | null = null;
	if (row.tagsJson) {
		try {
			tags = JSON.parse(row.tagsJson);
		} catch {
			tags = null;
		}
	}

	return c.json({
		status: row.status,
		summary: row.summary,
		tags,
		slug: row.slug,
	});
});

app.get('/:slug', async (c) => {
	const slug = c.req.param('slug');
	const db = getDb(c.env);
	const rows = await db
		.select({
			id: posts.id,
			slug: posts.slug,
			title: posts.title,
			bodyMd: posts.bodyMd,
			coverR2Key: posts.coverR2Key,
			summary: posts.summary,
			tagsJson: posts.tagsJson,
			viewCount: posts.viewCount,
			publishedAt: posts.publishedAt,
			authorName: users.name,
			authorAvatar: users.avatarUrl,
		})
		.from(posts)
		.innerJoin(users, eq(users.id, posts.authorId))
		.where(and(eq(posts.slug, slug), eq(posts.status, 'published')))
		.limit(1);

	const row = rows[0];
	if (!row) return c.json({ error: 'not_found' }, 404);

	c.executionCtx.waitUntil(
		db
			.update(posts)
			.set({ viewCount: sql`${posts.viewCount} + 1` })
			.where(eq(posts.id, row.id)),
	);

	let tags: string[] | null = null;
	if (row.tagsJson) {
		try {
			tags = JSON.parse(row.tagsJson);
		} catch {
			tags = null;
		}
	}

	return c.json({
		post: {
			id: row.id,
			slug: row.slug,
			title: row.title,
			bodyMd: row.bodyMd,
			coverR2Key: row.coverR2Key,
			summary: row.summary,
			tags,
			viewCount: row.viewCount,
			publishedAt: row.publishedAt,
		},
		author: {
			name: row.authorName,
			avatarUrl: row.authorAvatar,
		},
	});
});

export default app;
