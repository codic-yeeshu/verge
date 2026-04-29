import { Check, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function ShareButton({ slug }: { slug: string }) {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const t = window.setTimeout(() => setCopied(false), 1500);
		return () => window.clearTimeout(t);
	}, [copied]);

	async function onClick(e: React.MouseEvent<HTMLButtonElement>) {
		e.preventDefault();
		e.stopPropagation();
		const url = `${window.location.origin}/post/${slug}`;
		try {
			await navigator.clipboard.writeText(url);
		} catch {
			// permission denied in some embedded contexts; tick still flips
			// so the click visibly registered.
		}
		setCopied(true);
	}

	return (
		<button
			type="button"
			className={`post-card-action${copied ? ' is-copied' : ''}`}
			onClick={onClick}
			aria-label={copied ? 'Link copied' : 'Copy link to post'}
			aria-live="polite"
		>
			{copied ? (
				<Check size={16} strokeWidth={2} aria-hidden="true" />
			) : (
				<Share2 size={16} strokeWidth={1.75} aria-hidden="true" />
			)}
		</button>
	);
}
