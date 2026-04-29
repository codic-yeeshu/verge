import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

const id = () => text('id').primaryKey().$defaultFn(() => nanoid());
const createdAt = () => integer('created_at').notNull().$defaultFn(() => Date.now());

export const users = sqliteTable('users', {
	id: id(),
	githubId: text('github_id').notNull().unique(),
	email: text('email'),
	name: text('name'),
	avatarUrl: text('avatar_url'),
	createdAt: createdAt(),
});

export const sessions = sqliteTable('sessions', {
	id: id(),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at').notNull(),
});

export const POST_STATUSES = ['draft', 'processing', 'published'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const posts = sqliteTable(
	'posts',
	{
		id: id(),
		slug: text('slug').notNull().unique(),
		authorId: text('author_id').notNull().references(() => users.id),
		title: text('title').notNull(),
		bodyMd: text('body_md').notNull(),
		coverR2Key: text('cover_r2_key'),
		status: text('status', { enum: POST_STATUSES }).notNull(),
		summary: text('summary'),
		tagsJson: text('tags_json'),
		viewCount: integer('view_count').notNull().default(0),
		createdAt: createdAt(),
		publishedAt: integer('published_at'),
	},
	(table) => [
		check('posts_status_check', sql`${table.status} IN ('draft', 'processing', 'published')`),
	],
);

export const comments = sqliteTable('comments', {
	id: id(),
	postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
	userId: text('user_id').notNull().references(() => users.id),
	body: text('body').notNull(),
	createdAt: createdAt(),
});

export const subscribers = sqliteTable('subscribers', {
	id: id(),
	email: text('email').notNull().unique(),
	createdAt: createdAt(),
});
