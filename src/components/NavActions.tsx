import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';
import UserMenu, { type MenuUser } from './UserMenu';

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
			<a className="nav-signin" href="/api/auth/github">
				Sign in
			</a>
			<a className="nav-write" href="/api/auth/github">
				Write
			</a>
		</>
	);
}
