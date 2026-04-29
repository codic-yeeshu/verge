import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { posts, subscribers } from '../db/schema';
import { cachedAI } from '../lib/ai-cache';
import { logEvent } from '../lib/log';
import { invalidatePostCache } from '../lib/post-cache';

const LLAMA = '@cf/meta/llama-3.1-8b-instruct';
const BODY_SNIPPET_CHARS = 2000;
const SUMMARY_MAX_CHARS = 280;
const NEWSLETTER_BATCH = 50;
const RESEND_FROM = 'Verge <newsletter@verge-mail.yeeshu.dev>';

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
					await sendNewsletter(message.body.postId, env);
					break;
			}
			message.ack();
		} catch (err) {
			console.error('queue: message failed', {
				body: message.body,
				attempts: message.attempts,
				error: err instanceof Error ? err.message : String(err),
			});
			logEvent('error', {
				event_source: 'queue',
				body_type: message.body.type,
				message: err instanceof Error ? err.message : String(err),
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

	const publishedAt = Date.now();
	await db
		.update(posts)
		.set({
			summary,
			tagsJson: JSON.stringify(tags),
			status: 'published',
			publishedAt,
		})
		.where(eq(posts.id, postId));

	logEvent('post_published', { postId, slug: post.slug, publishedAt });

	await invalidatePostCache(post.slug, env.PUBLIC_BASE_URL);

	await env.JOBS.send({ type: 'send_newsletter', postId });
}

async function sendNewsletter(postId: string, env: Env): Promise<void> {
	const db = getDb(env);
	const postRows = await db
		.select({
			id: posts.id,
			slug: posts.slug,
			title: posts.title,
			summary: posts.summary,
		})
		.from(posts)
		.where(eq(posts.id, postId))
		.limit(1);

	const post = postRows[0];
	if (!post) {
		console.warn('send_newsletter: post not found, skipping', { postId });
		return;
	}

	const subRows = await db.select({ email: subscribers.email }).from(subscribers);
	const recipients = subRows.map((r) => r.email);

	if (recipients.length === 0) {
		logEvent('newsletter_skipped', { postId, reason: 'no_subscribers' });
		return;
	}

	if (!env.RESEND_API_KEY) {
		console.log(`Would send to ${recipients.length} subscribers`);
		logEvent('newsletter_skipped', {
			postId,
			reason: 'no_resend_key',
			subscribers: recipients.length,
		});
		return;
	}

	const url = new URL(`/post/${post.slug}`, env.PUBLIC_BASE_URL).toString();
	const subject = `New on Verge: ${post.title}`;
	const html = renderEmail({ title: post.title, summary: post.summary, url });

	let sent = 0;
	let failed = 0;
	for (let i = 0; i < recipients.length; i += NEWSLETTER_BATCH) {
		const batch = recipients.slice(i, i + NEWSLETTER_BATCH);
		const results = await Promise.all(
			batch.map((email) => sendOne(email, subject, html, env.RESEND_API_KEY!)),
		);
		for (const ok of results) {
			if (ok) sent++;
			else failed++;
		}
	}

	logEvent('newsletter_sent', { postId, slug: post.slug, sent, failed, total: recipients.length });
}

async function sendOne(email: string, subject: string, html: string, apiKey: string): Promise<boolean> {
	try {
		const res = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				from: RESEND_FROM,
				to: email,
				subject,
				html,
			}),
		});
		if (!res.ok) {
			const text = await res.text().catch(() => '');
			console.warn('[newsletter] resend failed', { email, status: res.status, body: text.slice(0, 200) });
			return false;
		}
		return true;
	} catch (err) {
		console.warn('[newsletter] resend threw', { email, error: err instanceof Error ? err.message : String(err) });
		return false;
	}
}

function renderEmail({ title, summary, url }: { title: string; summary: string | null; url: string }): string {
	const safeTitle = escapeHtml(title);
	const safeSummary = summary ? escapeHtml(summary) : '';
	const safeUrl = encodeURI(url);
	return `<!doctype html>
<html><body style="font-family: ui-sans-serif, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; line-height: 1.6; color: #0f172a;">
<h1 style="font-size: 22px; margin: 0 0 12px;">${safeTitle}</h1>
${safeSummary ? `<p style="color: #475569;">${safeSummary}</p>` : ''}
<p><a href="${safeUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 10px 16px; border-radius: 6px; text-decoration: none;">Read on Verge →</a></p>
</body></html>`;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
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
