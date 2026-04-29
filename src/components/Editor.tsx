import MDEditor from '@uiw/react-md-editor';
import { ImagePlus, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

type Status = 'idle' | 'saving' | 'processing' | 'published' | 'error';

interface CreateResp {
	postId: string;
	slug: string;
	status: 'processing';
}

interface StatusResp {
	status: 'draft' | 'processing' | 'published';
	summary: string | null;
	tags: string[] | null;
	slug: string;
}

interface UploadResp {
	key: string;
}

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 60;

export default function Editor() {
	const [title, setTitle] = useState('');
	const [body, setBody] = useState<string | undefined>('');
	const [coverKey, setCoverKey] = useState<string | null>(null);
	const [coverPreview, setCoverPreview] = useState<string | null>(null);
	const [coverUploading, setCoverUploading] = useState(false);
	const [status, setStatus] = useState<Status>('idle');
	const [slug, setSlug] = useState<string | null>(null);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [theme, setTheme] = useState<'light' | 'dark'>('light');

	useEffect(() => {
		const read = () =>
			setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
		read();
		const obs = new MutationObserver(read);
		obs.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-theme'],
		});
		return () => obs.disconnect();
	}, []);

	const locked = status === 'saving' || status === 'processing' || status === 'published';

	async function onCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		setCoverPreview(URL.createObjectURL(file));
		setCoverUploading(true);
		try {
			const fd = new FormData();
			fd.append('file', file);
			const res = await fetch('/api/upload', { method: 'POST', body: fd });
			if (!res.ok) throw new Error(`Upload failed (${res.status})`);
			const data = (await res.json()) as UploadResp;
			setCoverKey(data.key);
		} catch (err) {
			setErrorMsg(err instanceof Error ? err.message : 'Cover upload failed');
			setCoverPreview(null);
		} finally {
			setCoverUploading(false);
		}
	}

	async function publish() {
		setErrorMsg(null);
		setStatus('saving');
		try {
			const res = await fetch('/api/posts', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: title.trim(),
					bodyMd: (body ?? '').trim(),
					coverR2Key: coverKey,
				}),
			});
			if (!res.ok) {
				const text = await res.text();
				throw new Error(`Create failed (${res.status}): ${text}`);
			}
			const data = (await res.json()) as CreateResp;
			setSlug(data.slug);
			setStatus('processing');
			pollStatus(data.postId);
		} catch (err) {
			setStatus('error');
			setErrorMsg(err instanceof Error ? err.message : 'Failed to create post');
		}
	}

	function pollStatus(postId: string) {
		let attempts = 0;
		const tick = async () => {
			attempts++;
			try {
				const res = await fetch(`/api/posts/${postId}/status`);
				if (res.ok) {
					const data = (await res.json()) as StatusResp;
					if (data.status === 'published') {
						setSlug(data.slug);
						setStatus('published');
						return;
					}
				}
			} catch {
				// transient — keep polling
			}
			if (attempts < POLL_MAX_ATTEMPTS) {
				setTimeout(tick, POLL_INTERVAL_MS);
			} else {
				setStatus('error');
				setErrorMsg('Timed out waiting for processing.');
			}
		};
		setTimeout(tick, POLL_INTERVAL_MS);
	}

	const canPublish = !locked && title.trim().length > 0 && (body ?? '').trim().length > 0;

	return (
		<div className="editor-shell">
			<StatusPill status={status} slug={slug} errorMsg={errorMsg} />

			<input
				className="editor-title"
				type="text"
				placeholder="Title"
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				disabled={locked}
				aria-label="Post title"
			/>

			<div className="editor-cover">
				{coverPreview ? (
					<div className="cover-loaded">
						<img src={coverPreview} alt="Cover preview" />
						<label className="cover-replace">
							<ImagePlus size={14} strokeWidth={1.75} aria-hidden="true" />
							<span>Replace</span>
							<input
								type="file"
								accept="image/*"
								onChange={onCoverChange}
								disabled={locked || coverUploading}
								hidden
							/>
						</label>
					</div>
				) : (
					<label className={`cover-zone${coverUploading ? ' is-uploading' : ''}`}>
						{coverUploading ? (
							<Loader2 className="spinner" size={20} strokeWidth={1.75} aria-hidden="true" />
						) : (
							<ImagePlus size={20} strokeWidth={1.75} aria-hidden="true" />
						)}
						<span>{coverUploading ? 'Uploading…' : 'Upload cover'}</span>
						<input
							type="file"
							accept="image/*"
							onChange={onCoverChange}
							disabled={locked || coverUploading}
							hidden
						/>
					</label>
				)}
			</div>

			<div className="editor-md" data-color-mode={theme}>
				<MDEditor
					value={body}
					onChange={setBody}
					height={520}
					preview="live"
					textareaProps={{
						disabled: locked,
						placeholder: 'Write your post in Markdown…',
					}}
				/>
			</div>

			<button
				type="button"
				className="editor-publish"
				onClick={publish}
				disabled={!canPublish}
			>
				{status === 'saving' ? 'Publishing…' : 'Publish'}
			</button>

			{errorMsg && status === 'error' && <p className="editor-error">{errorMsg}</p>}
		</div>
	);
}

function StatusPill({
	status,
	slug,
	errorMsg,
}: {
	status: Status;
	slug: string | null;
	errorMsg: string | null;
}) {
	if (status === 'idle') {
		return <span className="editor-status editor-status-draft">Draft</span>;
	}
	if (status === 'saving' || status === 'processing') {
		return (
			<span className="editor-status editor-status-processing">
				<Loader2 className="spinner" size={12} strokeWidth={2} aria-hidden="true" />
				Processing…
			</span>
		);
	}
	if (status === 'published' && slug) {
		return (
			<a className="editor-status editor-status-published" href={`/post/${slug}`}>
				Published — view post →
			</a>
		);
	}
	if (status === 'error') {
		return (
			<span className="editor-status editor-status-error" title={errorMsg ?? undefined}>
				Couldn’t publish
			</span>
		);
	}
	return null;
}
