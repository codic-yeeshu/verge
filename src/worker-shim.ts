import server from '@astrojs/cloudflare/entrypoints/server';
import { handleQueue } from './queue/consumer';

export { CommentRoom } from './do/comment-room';

export default {
	fetch: server.fetch,
	queue: handleQueue as any,
} satisfies ExportedHandler<Env>;
