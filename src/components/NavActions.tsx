import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';
import UserMenu, { type MenuUser } from './UserMenu';

function GithubMark({ size = 16 }: { size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="currentColor"
			aria-hidden="true"
		>
			<path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.16-.02-2.11-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18.91-.25 1.89-.38 2.86-.39.97 0 1.95.13 2.86.39 2.18-1.49 3.14-1.18 3.14-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.67.8.55C20.22 21.39 23.5 17.07 23.5 12 23.5 5.65 18.35.5 12 .5z"></path>
		</svg>
	);
}

type AuthState =
	| { status: 'loading' }
	| { status: 'guest' }
	| { status: 'user'; user: MenuUser };

export default function NavActions() {
	const [auth, setAuth] = useState<AuthState>({ status: 'loading' });

	useEffect(() => {
		let cancelled = false;
		fetch('/api/me')
			.then((r) => (r.ok ? r.json() : { user: null }))
			.then((data: { user: MenuUser | null }) => {
				if (cancelled) return;
				setAuth(data.user ? { status: 'user', user: data.user } : { status: 'guest' });
			})
			.catch(() => {
				if (!cancelled) setAuth({ status: 'guest' });
			});
		return () => {
			cancelled = true;
		};
	}, []);

	if (auth.status === 'loading') {
		return <span className="nav-actions-skeleton" aria-hidden="true" />;
	}

	if (auth.status === 'user') {
		return (
			<>
				<a className="nav-write" href="/editor">
					Write
				</a>
				<ThemeToggle />
				<UserMenu user={auth.user} />
			</>
		);
	}

	return (
		<>
			<a className="nav-github-cta" href="/api/auth/github">
				<GithubMark size={16} />
				<span>Continue with GitHub</span>
			</a>
			<a className="nav-write" href="/api/auth/github">
				Write
			</a>
			<ThemeToggle />
		</>
	);
}
