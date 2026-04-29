import { useEffect, useRef, useState } from 'react';

interface PublicComment {
	id: string;
	body: string;
	createdAt: number;
	authorName: string;
}

interface MeUser {
	id: string;
	name: string | null;
}

type ServerMessage =
	| { type: 'init'; presence: number; recentComments: PublicComment[] }
	| { type: 'presence'; count: number }
	| { type: 'new_comment'; comment: PublicComment }
	| { type: 'typing'; userName: string }
	| { type: 'error'; error: string };

const TYPING_RELAY_INTERVAL_MS = 2000;
const TYPING_INDICATOR_TTL_MS = 2500;

export default function CommentRoom({ postId }: { postId: string }) {
	const [presence, setPresence] = useState(0);
	const [comments, setComments] = useState<PublicComment[]>([]);
	const [typingName, setTypingName] = useState<string | null>(null);
	const [draft, setDraft] = useState('');
	const [authState, setAuthState] = useState<'loading' | 'guest' | 'user'>('loading');
	const [user, setUser] = useState<MeUser | null>(null);
	const [connState, setConnState] = useState<'connecting' | 'open' | 'closed'>('connecting');

	const wsRef = useRef<WebSocket | null>(null);
	const lastTypingSentRef = useRef(0);
	const typingClearTimerRef = useRef<number | null>(null);
	const listEndRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		let cancelled = false;
		fetch('/api/me')
			.then((r) => (r.ok ? r.json() : { user: null }))
			.then((data: { user: MeUser | null }) => {
				if (cancelled) return;
				setUser(data.user);
				setAuthState(data.user ? 'user' : 'guest');
			})
			.catch(() => {
				if (cancelled) return;
				setAuthState('guest');
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
		const ws = new WebSocket(`${proto}://${window.location.host}/api/room/${postId}`);
		wsRef.current = ws;

		ws.onopen = () => setConnState('open');
		ws.onclose = () => setConnState('closed');
		ws.onerror = () => setConnState('closed');

		ws.onmessage = (ev) => {
			let msg: ServerMessage;
			try {
				msg = JSON.parse(ev.data) as ServerMessage;
			} catch {
				return;
			}
			switch (msg.type) {
				case 'init':
					setPresence(msg.presence);
					setComments(msg.recentComments);
					break;
				case 'presence':
					setPresence(msg.count);
					break;
				case 'new_comment':
					setComments((prev) => [...prev, msg.comment]);
					break;
				case 'typing':
					setTypingName(msg.userName);
					if (typingClearTimerRef.current) {
						window.clearTimeout(typingClearTimerRef.current);
					}
					typingClearTimerRef.current = window.setTimeout(() => {
						setTypingName(null);
					}, TYPING_INDICATOR_TTL_MS);
					break;
				case 'error':
					console.warn('[CommentRoom]', msg.error);
					break;
			}
		};

		return () => {
			ws.close();
			if (typingClearTimerRef.current) window.clearTimeout(typingClearTimerRef.current);
		};
	}, [postId]);

	useEffect(() => {
		listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
	}, [comments.length]);

	function send(msg: object) {
		const ws = wsRef.current;
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(msg));
		}
	}

	function onSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const body = draft.trim();
		if (!body) return;
		send({ type: 'post_comment', body });
		setDraft('');
	}

	function onDraftChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
		setDraft(e.target.value);
		const now = Date.now();
		if (now - lastTypingSentRef.current > TYPING_RELAY_INTERVAL_MS) {
			lastTypingSentRef.current = now;
			send({ type: 'typing' });
		}
	}

	return (
		<div className="comment-room">
			<div className="comment-presence">
				<span aria-hidden="true">👁</span> {presence} {presence === 1 ? 'person' : 'people'}{' '}
				reading
				{connState !== 'open' && (
					<span className="comment-conn"> · {connState === 'connecting' ? 'connecting…' : 'disconnected'}</span>
				)}
			</div>

			{comments.length === 0 ? (
				<p className="comment-empty">No comments yet. Be the first to share a thought.</p>
			) : (
				<ul className="comment-list">
					{comments.map((c) => (
						<li key={c.id} className="comment">
							<div className="comment-meta">
								<strong>{c.authorName}</strong>
								<span> · {formatTime(c.createdAt)}</span>
							</div>
							<div className="comment-body">{c.body}</div>
						</li>
					))}
				</ul>
			)}
			<div ref={listEndRef} />

			{typingName && user?.name !== typingName && (
				<div className="comment-typing">{typingName} is typing…</div>
			)}

			{authState === 'loading' ? null : authState === 'user' ? (
				<form className="comment-form" onSubmit={onSubmit}>
					<textarea
						value={draft}
						onChange={onDraftChange}
						placeholder="Add a comment…"
						rows={3}
						maxLength={2000}
					/>
					<div className="comment-form-actions">
						<button type="submit" disabled={!draft.trim() || connState !== 'open'}>
							Post comment
						</button>
					</div>
				</form>
			) : (
				<a className="comment-signin-cta" href="/api/auth/github">
					Sign in with GitHub to join the discussion
				</a>
			)}
		</div>
	);
}

function formatTime(ts: number): string {
	const d = new Date(ts);
	const now = Date.now();
	const diffSec = Math.floor((now - ts) / 1000);
	if (diffSec < 60) return 'just now';
	if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
	if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
	return d.toLocaleDateString();
}
