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
			return JSON.parse(cached) as T;
		} catch {
			// fall through and recompute on parse failure
		}
	}

	const result = (await env.AI.run(model as Parameters<Ai['run']>[0], input as never)) as T;
	await env.RENDER_CACHE.put(key, JSON.stringify(result), { expirationTtl: TTL_SECONDS });
	return result;
}
