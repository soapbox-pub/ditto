import { Kysely } from 'kysely';

export async function up(_db: Kysely<any>): Promise<void> {
  // This migration used to create an FTS table for SQLite, but SQLite support was removed.
}

export async function down(_db: Kysely<any>): Promise<void> {
}
