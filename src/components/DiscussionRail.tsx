import { Send } from 'lucide-react';
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
	avatarUrl: string | null;
}

type ServerMessage =
	| { type: 'init'; presence: number; recentComments: PublicComment[] }
	| { type: 'presence'; count: number }
	| { type: 'new_comment'; comment: PublicComment }
	| { type: 'typing'; userName: string }
	| { type: 'error'; error: string };

const TYPING_RELAY_INTERVAL_MS = 2000;
const TYPING_INDICATOR_TTL_MS = 2500;

export default function DiscussionRail({ postId }: { postId: string }) {
	const [presence, setPresence] = useState(0);
	const [comments, setComments] = useState<PublicComment[]>([]);
	const [typingName, setTypingName] = useState<string | null>(null);
	const [draft, setDraft] = useState('');
	const [authState, setAuthState] = useState<'loading' | 'guest' | 'user'>('loading');
	const [user, setUser] = useState<MeUser | null>(null);
	const [connState, setConnState] = useState<'connecting' | 'open' | 'closed'>('connecting');
	const [posting, setPosting] = useState(false);

	const wsRef = useRef<WebSocket | null>(null);
	const lastTypingSentRef = useRef(0);
	const typingClearTimerRef = useRef<number | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		let cancelled = false;
		fetch('/api/me')
			.then((r) => (r.ok ? r.json() : { user: null }))
			.then((data) => {
				if (cancelled) return;
				const { user } = data as { user: MeUser | null };
				setUser(user);
				setAuthState(user ? 'user' : 'guest');
			})
			.catch(() => {
				if (!cancelled) setAuthState('guest');
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
					if (typingClearTimerRef.current) window.clearTimeout(typingClearTimerRef.current);
					typingClearTimerRef.current = window.setTimeout(() => {
						setTypingName(null);
					}, TYPING_INDICATOR_TTL_MS);
					break;
				case 'error':
					console.warn('[DiscussionRail]', msg.error);
					break;
			}
		};

		return () => {
			ws.close();
			if (typingClearTimerRef.current) window.clearTimeout(typingClearTimerRef.current);
		};
	}, [postId]);

	useEffect(() => {
		// Pin the rail's own scroll container — never the page — to the bottom
		// when new comments arrive.
		const el = listRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [comments.length]);

	function send(msg: object) {
		const ws = wsRef.current;
		if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
	}

	function submit() {
		const body = draft.trim();
		if (!body) return;
		setPosting(true);
		send({ type: 'post_comment', body });
		setDraft('');
		// release the posting flag once the broadcast lands; safety timeout caps it.
		window.setTimeout(() => setPosting(false), 600);
	}

	function onDraftChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
		setDraft(e.target.value);
		const now = Date.now();
		if (now - lastTypingSentRef.current > TYPING_RELAY_INTERVAL_MS) {
			lastTypingSentRef.current = now;
			send({ type: 'typing' });
		}
	}

	function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			submit();
		}
	}

	const draftRows = Math.min(4, Math.max(2, draft.split('\n').length));
	const isLive = connState === 'open';
	const showTyping = typingName && user?.name !== typingName;

	return (
		<div className="rail">
			<header className="rail-head">
				<h2 className="rail-title">Discussion</h2>
				<div className="rail-presence" aria-live="polite">
					<span
						className={`rail-dot${isLive ? ' is-live' : ''}`}
						aria-hidden="true"
					></span>
					<span>{presence} reading</span>
				</div>
			</header>

			<div className="rail-list" ref={listRef}>
				{comments.length === 0 ? (
					<p className="rail-empty">Be the first to share a thought.</p>
				) : (
					<ul className="rail-comments">
						{comments.map((c) => (
							<li key={c.id} className="rail-comment">
								<span className="rail-comment-avatar" aria-hidden="true">
									{(c.authorName.charAt(0) || '?').toUpperCase()}
								</span>
								<div className="rail-comment-bubble">
									<div className="rail-comment-meta">
										<strong>{c.authorName}</strong>
										<span className="rail-comment-time">{relativeTime(c.createdAt)}</span>
									</div>
									<div className="rail-comment-text">{c.body}</div>
								</div>
							</li>
						))}
					</ul>
				)}

				{showTyping && (
					<div className="rail-typing">
						<span>{typingName} is typing</span>
						<span className="rail-typing-dots" aria-hidden="true">
							<span></span>
							<span></span>
							<span></span>
						</span>
					</div>
				)}
			</div>

			<div className="rail-compose">
				{authState === 'loading' ? null : authState === 'user' ? (
					<form
						className="rail-form"
						onSubmit={(e) => {
							e.preventDefault();
							submit();
						}}
					>
						<textarea
							className="rail-textarea"
							value={draft}
							onChange={onDraftChange}
							onKeyDown={onKeyDown}
							placeholder="Add a comment…  (⌘↵ to send)"
							rows={draftRows}
							maxLength={2000}
							disabled={posting}
						/>
						<button
							type="submit"
							className="rail-send"
							aria-label="Send comment"
							disabled={!draft.trim() || posting || !isLive}
						>
							<Send size={16} strokeWidth={1.75} aria-hidden="true" />
						</button>
					</form>
				) : (
					<p className="rail-signin">
						<a href="/api/auth/github">Sign in</a> to join the discussion.
					</p>
				)}
			</div>
		</div>
	);
}

function relativeTime(ts: number): string {
	const diffMs = Date.now() - ts;
	const seconds = Math.max(0, Math.floor(diffMs / 1000));
	if (seconds < 45) return 'now';
	const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return rtf.format(-minutes, 'minute');
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return rtf.format(-hours, 'hour');
	const days = Math.floor(hours / 24);
	return rtf.format(-days, 'day');
}
