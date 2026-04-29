/// <reference types="@astrojs/cloudflare/types.d.ts" />

import type { users } from './db/schema';

export interface GeoInfo {
	country: string | null;
	city: string | null;
	timezone: string | null;
}

declare global {
	namespace App {
		interface Locals {
			user: typeof users.$inferSelect | null;
			geo: GeoInfo;
		}
	}
}

export {};
