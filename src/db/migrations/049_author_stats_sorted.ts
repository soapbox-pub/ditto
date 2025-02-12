import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createView('top_authors')
    .materialized()
    .as(db.selectFrom('author_stats').select(['pubkey', 'followers_count', 'search']).orderBy('followers_count desc'))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropView('top_authors').execute();
}
