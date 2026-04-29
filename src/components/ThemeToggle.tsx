import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

export default function ThemeToggle() {
	const [theme, setTheme] = useState<Theme>('light');
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
		setTheme(current);
		setMounted(true);
	}, []);

	function toggle() {
		const next: Theme = theme === 'dark' ? 'light' : 'dark';
		document.documentElement.dataset.theme = next;
		try {
			localStorage.setItem('theme', next);
		} catch {
			// ignore — private browsing, etc.
		}
		setTheme(next);
	}

	return (
		<button
			type="button"
			className="theme-toggle"
			onClick={toggle}
			aria-label={mounted ? `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode` : 'Toggle theme'}
			aria-pressed={theme === 'dark'}
		>
			{theme === 'dark' ? (
				<Sun size={18} strokeWidth={1.75} />
			) : (
				<Moon size={18} strokeWidth={1.75} />
			)}
		</button>
	);
}
