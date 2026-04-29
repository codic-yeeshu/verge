import MDEditor from '@uiw/react-md-editor';
import { useState } from 'react';

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
				setErrorMsg('Timed out waiting for processing. The post will appear once the AI step completes.');
			}
		};
		setTimeout(tick, POLL_INTERVAL_MS);
	}

	return (
		<div className="editor">
			<input
				className="editor-title"
				type="text"
				placeholder="Post title"
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				disabled={locked}
				aria-label="Post title"
			/>

			<label className="editor-cover">
				<span className="editor-cover-label">
					{coverUploading ? 'Uploading…' : coverKey ? 'Replace cover' : 'Add cover image'}
				</span>
				<input
					type="file"
					accept="image/*"
					onChange={onCoverChange}
					disabled={locked || coverUploading}
				/>
				{coverPreview && (
					<img src={coverPreview} alt="cover preview" className="editor-cover-preview" />
				)}
			</label>

			<div data-color-mode="dark" className="editor-md">
				<MDEditor
					value={body}
					onChange={setBody}
					height={420}
					preview="live"
					textareaProps={{ disabled: locked, placeholder: 'Write your post in Markdown…' }}
				/>
			</div>

			<div className="editor-actions">
				<button
					type="button"
					className="editor-publish"
					onClick={publish}
					disabled={locked || !title.trim() || !(body ?? '').trim()}
				>
					{status === 'saving' ? 'Saving…' : 'Publish'}
				</button>
				<StatusPill status={status} slug={slug} errorMsg={errorMsg} />
			</div>
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
	if (status === 'idle') return null;
	if (status === 'saving') return <span className="pill pill-info">Saving…</span>;
	if (status === 'processing') return <span className="pill pill-info">Processing with AI…</span>;
	if (status === 'published' && slug) {
		return (
			<span className="pill pill-success">
				Published! <a href={`/post/${slug}`}>View →</a>
			</span>
		);
	}
	if (status === 'error') return <span className="pill pill-error">{errorMsg ?? 'Error'}</span>;
	return null;
}
