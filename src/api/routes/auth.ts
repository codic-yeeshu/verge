import { ArcticFetchError, OAuth2RequestError, generateState } from 'arctic';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { getDb } from '../../db/client';
import { users } from '../../db/schema';
import {
	OAUTH_STATE_COOKIE,
	SESSION_COOKIE,
	type AuthVariables,
	clearSessionCookie,
	createGitHubProvider,
	createSession,
	invalidateSession,
	setSessionCookie,
} from '../../lib/auth';
import type { Bindings } from '../index';

const STATE_TTL_SECONDS = 60 * 10;

interface GitHubUser {
	id: number;
	login: string;
	name: string | null;
	avatar_url: string | null;
	email: string | null;
}

interface GitHubEmail {
	email: string;
	primary: boolean;
	verified: boolean;
}

const auth = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

auth.get('/github', (c) => {
	const github = createGitHubProvider(c.env);
	const state = generateState();
	const url = github.createAuthorizationURL(state, ['read:user', 'user:email']);

	setCookie(c, OAUTH_STATE_COOKIE, state, {
		httpOnly: true,
		secure: new URL(c.req.url).protocol === 'https:',
		sameSite: 'Lax',
		path: '/',
		maxAge: STATE_TTL_SECONDS,
	});

	return c.redirect(url.toString());
});

auth.get('/github/callback', async (c) => {
	const code = c.req.query('code');
	const state = c.req.query('state');
	const storedState = getCookie(c, OAUTH_STATE_COOKIE);

	deleteCookie(c, OAUTH_STATE_COOKIE, { path: '/' });

	if (!code || !state || !storedState || state !== storedState) {
		return c.json({ error: 'invalid_oauth_state' }, 400);
	}

	const github = createGitHubProvider(c.env);

	let accessToken: string;
	try {
		const tokens = await github.validateAuthorizationCode(code);
		accessToken = tokens.accessToken();
	} catch (err) {
		if (err instanceof OAuth2RequestError) {
			return c.json({ error: 'oauth_request_failed', code: err.code }, 400);
		}
		if (err instanceof ArcticFetchError) {
			return c.json({ error: 'github_unreachable' }, 502);
		}
		throw err;
	}

	const ghHeaders = {
		Authorization: `Bearer ${accessToken}`,
		'User-Agent': 'verge',
		Accept: 'application/vnd.github+json',
	};

	const userRes = await fetch('https://api.github.com/user', { headers: ghHeaders });
	if (!userRes.ok) {
		return c.json({ error: 'github_user_fetch_failed', status: userRes.status }, 502);
	}
	const ghUser = (await userRes.json()) as GitHubUser;

	let email = ghUser.email;
	if (!email) {
		const emailsRes = await fetch('https://api.github.com/user/emails', { headers: ghHeaders });
		if (!emailsRes.ok) {
			return c.json({ error: 'github_email_fetch_failed', status: emailsRes.status }, 502);
		}
		const emails = (await emailsRes.json()) as GitHubEmail[];
		email = emails.find((e) => e.primary && e.verified)?.email ?? null;
	}

	const db = getDb(c.env);
	const githubId = String(ghUser.id);
	const displayName = ghUser.name ?? ghUser.login;

	const existing = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.githubId, githubId))
		.limit(1);

	let userId: string;
	if (existing[0]) {
		userId = existing[0].id;
		await db
			.update(users)
			.set({ email, name: displayName, avatarUrl: ghUser.avatar_url })
			.where(eq(users.id, userId));
	} else {
		const inserted = await db
			.insert(users)
			.values({
				githubId,
				email,
				name: displayName,
				avatarUrl: ghUser.avatar_url,
			})
			.returning({ id: users.id });
		userId = inserted[0].id;
	}

	const sessionId = await createSession(db, userId);
	setSessionCookie(c, sessionId);

	return c.redirect('/');
});

auth.post('/logout', async (c) => {
	const sessionId = getCookie(c, SESSION_COOKIE);
	if (sessionId) {
		const db = getDb(c.env);
		await invalidateSession(db, sessionId);
	}
	clearSessionCookie(c);
	return c.redirect('/');
});

export default auth;
