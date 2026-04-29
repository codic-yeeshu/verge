import { marked } from 'marked';
import rehypeParse from 'rehype-parse';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';

const sanitizer = unified()
	.use(rehypeParse, { fragment: true })
	.use(rehypeSanitize)
	.use(rehypeStringify);

export async function renderMarkdown(md: string): Promise<string> {
	const rawHtml = marked.parse(md, { async: false }) as string;
	const file = await sanitizer.process(rawHtml);
	return String(file);
}
