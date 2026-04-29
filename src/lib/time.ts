// Smart relative time:
//  - <1min:  just now
//  - <1h:    Xm ago
//  - <24h:   Xh ago
//  - <7d:    Xd ago
//  - else:   "Apr 22"  (or "Apr 22, 2025" if a different year from now)
export function relativeTime(ts: number, now: number = Date.now()): string {
	const diff = now - ts;
	if (diff < 60_000) return 'just now';
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;

	const date = new Date(ts);
	const sameYear = date.getFullYear() === new Date(now).getFullYear();
	return new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		...(sameYear ? {} : { year: 'numeric' }),
	}).format(date);
}
