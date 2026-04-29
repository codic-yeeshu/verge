import { DurableObject } from 'cloudflare:workers';

export class CommentRoom extends DurableObject<Env> {
	async fetch(_request: Request): Promise<Response> {
		return new Response('CommentRoom not implemented', { status: 501 });
	}
}
