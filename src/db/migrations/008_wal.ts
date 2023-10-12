import { Kysely, sql } from '@/deps.ts';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`PRAGMA journal_mode = WAL`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`PRAGMA journal_mode = DELETE`.execute(db);
}
