import { DurableObject } from 'cloudflare:workers';
import { desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '../db/client';
import { comments, users } from '../db/schema';
import { SESSION_COOKIE, validateSession } from '../lib/auth';

const RECENT_LIMIT = 50;
const COMMENT_BODY_MAX = 2000;

interface Attachment {
	userId: string | null;
	userName: string | null;
	canPost: boolean;
}

interface PublicComment {
	id: string;
	body: string;
	createdAt: number;
	authorName: string;
}

type ServerMessage =
	| { type: 'init'; presence: number; recentComments: PublicComment[] }
	| { type: 'presence'; count: number }
	| { type: 'new_comment'; comment: PublicComment }
	| { type: 'typing'; userName: string }
	| { type: 'error'; error: string };

interface ClientPostComment {
	type: 'post_comment';
	body: string;
}
interface ClientTyping {
	type: 'typing';
}
type ClientMessage = ClientPostComment | ClientTyping;

export class CommentRoom extends DurableObject<Env> {
	private postId: string | null = null;
	private recent: PublicComment[] | null = null;

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get('Upgrade') !== 'websocket') {
			return new Response('Expected WebSocket upgrade', { status: 426 });
		}

		const postId = await this.resolvePostId(request);
		if (!postId) return new Response('Missing postId', { status: 400 });

		const attachment = await this.authenticate(request);

		const pair = new WebSocketPair();
		const client = pair[0];
		const server = pair[1];

		// Hibernatable accept — survives DO eviction without dropping the socket.
		this.ctx.acceptWebSocket(server);
		server.serializeAttachment(attachment);

		const recent = await this.getRecent();
		const presence = this.ctx.getWebSockets().length;

		this.sendTo(server, { type: 'init', presence, recentComments: recent });
		this.broadcast({ type: 'presence', count: presence }, server);

		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
		if (typeof raw !== 'string') return;

		let msg: ClientMessage;
		try {
			msg = JSON.parse(raw) as ClientMessage;
		} catch {
			return;
		}

		const att = ws.deserializeAttachment() as Attachment | null;
		if (!att) return;

		if (msg.type === 'post_comment') {
			if (!att.canPost || !att.userId) {
				this.sendTo(ws, { type: 'error', error: 'unauthorized' });
				return;
			}
			const body = String(msg.body ?? '').trim().slice(0, COMMENT_BODY_MAX);
			if (!body) return;

			const postId = await this.resolvePostId();
			if (!postId) {
				this.sendTo(ws, { type: 'error', error: 'no_post' });
				return;
			}

			const id = nanoid();
			const createdAt = Date.now();
			const db = getDb(this.env);
			await db.insert(comments).values({
				id,
				postId,
				userId: att.userId,
				body,
				createdAt,
			});

			const comment: PublicComment = {
				id,
				body,
				createdAt,
				authorName: att.userName ?? 'anon',
			};
			this.appendRecent(comment);
			this.broadcast({ type: 'new_comment', comment });
			return;
		}

		if (msg.type === 'typing') {
			if (!att.userName) return;
			this.broadcast({ type: 'typing', userName: att.userName }, ws);
		}
	}

	async webSocketClose(ws: WebSocket, code: number, _reason: string, _wasClean: boolean): Promise<void> {
		try {
			ws.close(code);
		} catch {
			// already closing
		}
		const remaining = this.ctx.getWebSockets().filter((s) => s !== ws).length;
		this.broadcast({ type: 'presence', count: remaining }, ws);
	}

	async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
		console.error('[CommentRoom] ws error', error);
		try {
			ws.close(1011, 'internal_error');
		} catch {
			// ignore
		}
	}

	private async resolvePostId(request?: Request): Promise<string | null> {
		if (this.postId) return this.postId;

		const stored = (await this.ctx.storage.get<string>('postId')) ?? null;
		if (stored) {
			this.postId = stored;
			return stored;
		}

		if (!request) return null;
		const m = new URL(request.url).pathname.match(/\/api\/room\/([^/]+)/);
		const postId = m?.[1];
		if (!postId) return null;

		await this.ctx.storage.put('postId', postId);
		this.postId = postId;
		return postId;
	}

	private async authenticate(request: Request): Promise<Attachment> {
		const cookieHeader = request.headers.get('Cookie') ?? '';
		const sessionId = parseCookie(cookieHeader, SESSION_COOKIE);
		if (!sessionId) return { userId: null, userName: null, canPost: false };

		const result = await validateSession(getDb(this.env), sessionId);
		if (!result) return { userId: null, userName: null, canPost: false };

		return {
			userId: result.user.id,
			userName: result.user.name ?? 'anon',
			canPost: true,
		};
	}

	private async getRecent(): Promise<PublicComment[]> {
		if (this.recent) return this.recent;
		const postId = await this.resolvePostId();
		if (!postId) return [];

		const db = getDb(this.env);
		const rows = await db
			.select({
				id: comments.id,
				body: comments.body,
				createdAt: comments.createdAt,
				authorName: users.name,
			})
			.from(comments)
			.innerJoin(users, eq(users.id, comments.userId))
			.where(eq(comments.postId, postId))
			.orderBy(desc(comments.createdAt))
			.limit(RECENT_LIMIT);

		// rows are newest-first; flip to oldest-first for display.
		const ordered: PublicComment[] = rows
			.map((r) => ({
				id: r.id,
				body: r.body,
				createdAt: r.createdAt,
				authorName: r.authorName ?? 'anon',
			}))
			.reverse();
		this.recent = ordered;
		return ordered;
	}

	private appendRecent(c: PublicComment): void {
		if (this.recent === null) this.recent = [];
		this.recent.push(c);
		if (this.recent.length > RECENT_LIMIT) {
			this.recent = this.recent.slice(-RECENT_LIMIT);
		}
	}

	private sendTo(ws: WebSocket, msg: ServerMessage): void {
		try {
			ws.send(JSON.stringify(msg));
		} catch {
			// socket gone
		}
	}

	private broadcast(msg: ServerMessage, exclude?: WebSocket): void {
		const data = JSON.stringify(msg);
		for (const ws of this.ctx.getWebSockets()) {
			if (ws === exclude) continue;
			try {
				ws.send(data);
			} catch {
				// socket gone
			}
		}
	}
}

function parseCookie(header: string, name: string): string | null {
	for (const part of header.split(';')) {
		const trimmed = part.trim();
		const eq = trimmed.indexOf('=');
		if (eq < 0) continue;
		if (trimmed.slice(0, eq) === name) {
			return decodeURIComponent(trimmed.slice(eq + 1));
		}
	}
	return null;
}
