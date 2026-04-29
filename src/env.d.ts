/// <reference types="@astrojs/cloudflare/types.d.ts" />

import type { users } from './db/schema';

declare global {
	namespace App {
		interface Locals {
			user: typeof users.$inferSelect | null;
		}
	}
}

export {};
