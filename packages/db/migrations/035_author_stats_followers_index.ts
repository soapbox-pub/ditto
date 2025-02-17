import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createIndex('author_stats_followers_count_idx')
    .ifNotExists()
    .on('author_stats')
    .column('followers_count desc')
    .execute();

  // This index should have never been added, because pubkey is the primary key.
  await db.schema.dropIndex('idx_author_stats_pubkey').ifExists().execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('author_stats_followers_count_idx').ifExists().execute();
}
