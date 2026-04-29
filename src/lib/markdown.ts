import { marked } from 'marked';
import rehypeParse from 'rehype-parse';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';

const sanitizer = unified()
	.use(rehypeParse, { fragment: true })
	.use(rehypeSanitize)
	.use(rehypeStringify);

// Match `<img ... alt="[caption] some text" ...>` and rewrite to
// `<figure><img alt="some text"></figure><figcaption>some text</figcaption>`.
// Order of attributes inside the tag is allowed to vary.
const captionedImgRe = /<img\b([^>]*?)\salt="\s*\[caption\]\s*([^"]*)"([^>]*?)>/gi;

// Marked wraps standalone images in <p>. Unwrap when the paragraph is just
// the figure — keeps the DOM tree valid (figure inside p is technically not).
const figureInParaRe = /<p>(\s*<figure\b[^>]*>[\s\S]*?<\/figure>\s*)<\/p>/g;

function wrapCaptionedImages(html: string): string {
	const wrapped = html.replace(captionedImgRe, (_match, before, caption, after) => {
		const cleanedImg = `<img${before} alt="${caption}"${after}>`;
		return `<figure>${cleanedImg}<figcaption>${caption}</figcaption></figure>`;
	});
	return wrapped.replace(figureInParaRe, '$1');
}

// Tag every <img> with `loading="lazy" decoding="async"` after sanitization.
// rehype-sanitize's default schema strips unrecognized attrs, so we add them
// back at the very end rather than fighting the schema.
function lazyLoadImages(html: string): string {
	return html.replace(/<img\b/g, '<img loading="lazy" decoding="async"');
}

export async function renderMarkdown(md: string): Promise<string> {
	const rawHtml = marked.parse(md, { async: false }) as string;
	const withFigures = wrapCaptionedImages(rawHtml);
	const file = await sanitizer.process(withFigures);
	return lazyLoadImages(String(file));
}
