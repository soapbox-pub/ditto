import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('author_stats')
    .addColumn('streak_start', 'integer')
    .addColumn('streak_end', 'integer')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('author_stats')
    .dropColumn('streak_start')
    .dropColumn('streak_end')
    .execute();
}
