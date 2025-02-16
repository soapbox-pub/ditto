import { type Kysely, sql } from 'kysely';

// deno-lint-ignore no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('author_stats')
    .addColumn('search', 'text', (col) => col.notNull().defaultTo(''))
    .execute();

  await sql`CREATE INDEX author_stats_search_idx ON author_stats USING GIN (search gin_trgm_ops)`.execute(db);

  await db.insertInto('author_stats')
    .columns(['pubkey', 'search'])
    .expression(
      db.selectFrom('author_search')
        .select(['pubkey', 'search']),
    )
    .onConflict((oc) =>
      oc.column('pubkey')
        .doUpdateSet((eb) => ({
          search: eb.ref('excluded.search'),
        }))
    )
    .execute();

  await db.schema.dropIndex('author_search_search_idx').ifExists().execute();
  await db.schema.dropTable('author_search').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('author_stats_search_idx').ifExists().execute();
  await db.schema.alterTable('author_stats').dropColumn('search').execute();
}
