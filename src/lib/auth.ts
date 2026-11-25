import { GitHub } from 'arctic';
import { eq } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { nanoid } from 'nanoid';
import { type Db, getDb } from '../db/client';
import { sessions, users } from '../db/schema';

export const SESSION_COOKIE = 'verge_session';
export const OAUTH_STATE_COOKIE = 'verge_oauth_state';

const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const SESSION_RENEW_THRESHOLD_MS = SESSION_TTL_MS / 2;
export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;

type AuthEnv = {
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
};

export function createGitHubProvider(env: AuthEnv): GitHub {
	return new GitHub(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET, null);
}

export async function createSession(db: Db, userId: string): Promise<string> {
	const id = nanoid(40);
	await db.insert(sessions).values({
		id,
		userId,
		expiresAt: Date.now() + SESSION_TTL_MS,
	});
	return id;
}

export async function validateSession(
	db: Db,
	sessionId: string,
): Promise<{ user: UserRow; session: SessionRow; renewed: boolean } | null> {
	const rows = await db
		.select({ user: users, session: sessions })
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(eq(sessions.id, sessionId))
		.limit(1);

	const row = rows[0];
	if (!row) return null;

	const now = Date.now();
	if (row.session.expiresAt < now) {
		await invalidateSession(db, sessionId);
		return null;
	}

	if (row.session.expiresAt - now < SESSION_RENEW_THRESHOLD_MS) {
		const newExpiresAt = now + SESSION_TTL_MS;
		await db
			.update(sessions)
			.set({ expiresAt: newExpiresAt })
			.where(eq(sessions.id, sessionId));
		return {
			user: row.user,
			session: { ...row.session, expiresAt: newExpiresAt },
			renewed: true,
		};
	}

	return { ...row, renewed: false };
}

export async function invalidateSession(db: Db, sessionId: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

function isSecureRequest(c: Context): boolean {
	return new URL(c.req.url).protocol === 'https:';
}

export function setSessionCookie(c: Context, sessionId: string): void {
	setCookie(c, SESSION_COOKIE, sessionId, {
		httpOnly: true,
		secure: isSecureRequest(c),
		sameSite: 'Lax',
		path: '/',
		maxAge: SESSION_TTL_SECONDS,
	});
}

export function clearSessionCookie(c: Context): void {
	deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

export type AuthVariables = {
	user: UserRow | null;
	session: SessionRow | null;
};

export const authMiddleware: MiddlewareHandler<{
	Bindings: { DB: D1Database };
	Variables: AuthVariables;
}> = async (c, next) => {
	const sessionId = getCookie(c, SESSION_COOKIE);

	if (!sessionId) {
		c.set('user', null);
		c.set('session', null);
		return next();
	}

	const db = getDb(c.env);
	const result = await validateSession(db, sessionId);

	if (!result) {
		c.set('user', null);
		c.set('session', null);
		clearSessionCookie(c);
		return next();
	}

	if (result.renewed) {
		setSessionCookie(c, sessionId);
	}

	c.set('user', result.user);
	c.set('session', result.session);
	return next();
};
