import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { posts } from '../db/schema';
import { cachedAI } from '../lib/ai-cache';

const LLAMA = '@cf/meta/llama-3.1-8b-instruct';
const BODY_SNIPPET_CHARS = 2000;
const SUMMARY_MAX_CHARS = 280;

export interface ProcessPostMessage {
	type: 'process_post';
	postId: string;
}

export interface SendNewsletterMessage {
	type: 'send_newsletter';
	postId: string;
}

export type JobMessage = ProcessPostMessage | SendNewsletterMessage;

interface AiResponseShape {
	response?: string;
}

export async function handleQueue(batch: MessageBatch<JobMessage>, env: Env): Promise<void> {
	for (const message of batch.messages) {
		try {
			switch (message.body.type) {
				case 'process_post':
					await processPost(message.body.postId, env);
					break;
				case 'send_newsletter':
					console.log(`TODO: newsletter for post ${message.body.postId}`);
					break;
			}
			message.ack();
		} catch (err) {
			console.error('queue: message failed', {
				body: message.body,
				attempts: message.attempts,
				error: err instanceof Error ? err.message : String(err),
			});
			message.retry();
		}
	}
}

async function processPost(postId: string, env: Env): Promise<void> {
	const db = getDb(env);
	const rows = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
	const post = rows[0];
	if (!post) {
		console.warn(`process_post: post not found, skipping`, { postId });
		return;
	}

	const snippet = post.bodyMd.slice(0, BODY_SNIPPET_CHARS);

	const summaryRes = await cachedAI<AiResponseShape>(env, LLAMA, {
		prompt:
			`Summarize this blog post in 2 sentences, max 280 chars. Output only the summary, no preamble.\n\nPOST: ${snippet}`,
	});
	const summary = (summaryRes.response ?? '').trim().slice(0, SUMMARY_MAX_CHARS);

	const tagsRes = await cachedAI<AiResponseShape>(env, LLAMA, {
		prompt:
			`Generate 5 short topic tags for this blog post. Output a JSON array of lowercase strings, nothing else.\n\nPOST: ${snippet}`,
	});
	const tags = parseTags(tagsRes.response);

	await db
		.update(posts)
		.set({
			summary,
			tagsJson: JSON.stringify(tags),
			status: 'published',
			publishedAt: Date.now(),
		})
		.where(eq(posts.id, postId));

	// TODO Phase 5: caches.default.delete(`https://<host>/post/${post.slug}`) once we know the host (read from a binding/secret).

	await env.JOBS.send({ type: 'send_newsletter', postId });
}

function parseTags(raw: string | undefined): string[] {
	if (!raw) return [];
	const stripped = raw
		.replace(/```(?:json)?\s*/gi, '')
		.replace(/```\s*$/g, '')
		.trim();
	const start = stripped.indexOf('[');
	const end = stripped.lastIndexOf(']');
	if (start === -1 || end === -1 || end <= start) return [];
	const candidate = stripped.slice(start, end + 1);
	try {
		const parsed = JSON.parse(candidate);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter((t): t is string => typeof t === 'string')
			.map((t) => t.toLowerCase().trim())
			.filter((t) => t.length > 0 && t.length <= 40)
			.slice(0, 5);
	} catch {
		return [];
	}
}
