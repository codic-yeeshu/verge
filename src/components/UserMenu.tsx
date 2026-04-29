import { LayoutDashboard, LogOut, Mail } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface MenuUser {
	id: string;
	name: string | null;
	avatarUrl: string | null;
}

export default function UserMenu({ user }: { user: MenuUser }) {
	const [open, setOpen] = useState(false);
	const wrapperRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		function onPointerDown(e: PointerEvent) {
			if (!wrapperRef.current) return;
			if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
		}
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') setOpen(false);
		}
		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKey);
		};
	}, [open]);

	const displayName = user.name?.trim() || 'You';
	const initial = (displayName.charAt(0) || '?').toUpperCase();

	return (
		<div className="user-menu" ref={wrapperRef}>
			<button
				type="button"
				className="user-menu-trigger"
				onClick={() => setOpen((o) => !o)}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-label={`Account menu for ${displayName}`}
			>
				{user.avatarUrl ? (
					<img src={user.avatarUrl} alt="" className="user-menu-avatar" />
				) : (
					<span
						className="user-menu-avatar user-menu-avatar-fallback"
						aria-hidden="true"
					>
						{initial}
					</span>
				)}
			</button>

			{open && (
				<div className="user-menu-popover" role="menu">
					<div className="user-menu-name" role="presentation">
						{displayName}
					</div>
					<a className="user-menu-item" href="/editor" role="menuitem">
						<LayoutDashboard size={16} strokeWidth={1.75} aria-hidden="true" />
						<span>Dashboard</span>
					</a>
					<a className="user-menu-item" href="/#subscribe-form" role="menuitem">
						<Mail size={16} strokeWidth={1.75} aria-hidden="true" />
						<span>Subscribe to newsletter</span>
					</a>
					<div className="user-menu-divider" role="separator" />
					<form action="/api/auth/logout" method="post" className="user-menu-form">
						<button
							type="submit"
							className="user-menu-item user-menu-item-button"
							role="menuitem"
						>
							<LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
							<span>Sign out</span>
						</button>
					</form>
				</div>
			)}
		</div>
	);
}
