import type { Kysely } from 'kysely';

export async function up(_db: Kysely<unknown>): Promise<void> {
  // This migration used to create an FTS table for SQLite, but SQLite support was removed.
}

export async function down(_db: Kysely<unknown>): Promise<void> {
}
