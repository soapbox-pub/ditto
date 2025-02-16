import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createIndex('nostr_pgfts_gin_search_vec')
    .ifNotExists()
    .on('nostr_pgfts')
    .using('gin')
    .column('search_vec')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('nostr_pgfts_gin_search_vec').ifExists().execute();
}
