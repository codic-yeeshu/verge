import { logEvent } from './log';

const TTL_SECONDS = 24 * 60 * 60;

type AiCacheEnv = {
	AI: Ai;
	RENDER_CACHE: KVNamespace;
};

async function sha256(input: string): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export async function cachedAI<T = unknown>(
	env: AiCacheEnv,
	model: string,
	input: object,
): Promise<T> {
	const inputStr = JSON.stringify(input);
	const hash = await sha256(`${model}\n${inputStr}`);
	const key = `ai:${model}:${hash}`;

	const cached = await env.RENDER_CACHE.get(key);
	if (cached !== null) {
		try {
			const parsed = JSON.parse(cached) as T;
			console.log('[ai-cache] HIT', key);
			logEvent('ai_call', { model, ms: 0, cached: true });
			return parsed;
		} catch {
			console.warn('[ai-cache] CORRUPT', key);
		}
	}

	console.log('[ai-cache] MISS', key);
	const start = Date.now();
	const result = (await env.AI.run(model as Parameters<Ai['run']>[0], input as never)) as T;
	const ms = Date.now() - start;
	logEvent('ai_call', { model, ms, cached: false });
	await env.RENDER_CACHE.put(key, JSON.stringify(result), { expirationTtl: TTL_SECONDS });
	return result;
}
