import { type Kysely, sql } from 'kysely';

// deno-lint-ignore no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createView('top_authors')
    .materialized()
    .as(db.selectFrom('author_stats').select(['pubkey', 'followers_count', 'search']).orderBy('followers_count desc'))
    .execute();

  await sql`CREATE INDEX top_authors_search_idx ON top_authors USING GIN (search gin_trgm_ops)`.execute(db);

  await db.schema.createIndex('top_authors_pubkey_idx').on('top_authors').column('pubkey').execute();

  await db.schema.dropIndex('author_stats_search_idx').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropView('top_authors').execute();
  await sql`CREATE INDEX author_stats_search_idx ON author_stats USING GIN (search gin_trgm_ops)`.execute(db);
}
