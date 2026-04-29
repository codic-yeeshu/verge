type Json = string | number | boolean | null | Json[] | { [k: string]: Json | undefined };

export function logEvent(event: string, data: Record<string, Json | undefined> = {}): void {
	const payload: Record<string, unknown> = { event, time: Date.now() };
	for (const [k, v] of Object.entries(data)) {
		if (v !== undefined) payload[k] = v;
	}
	console.log(JSON.stringify(payload));
}
