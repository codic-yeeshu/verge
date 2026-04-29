import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export type Db = ReturnType<typeof getDb>;

export function getDb(env: Pick<Env & { DB: D1Database }, 'DB'>) {
	return drizzle(env.DB, { schema });
}
