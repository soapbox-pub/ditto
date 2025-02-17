import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('author_search')
    .addColumn('pubkey', 'char(64)', (col) => col.primaryKey())
    .addColumn('search', 'text', (col) => col.notNull())
    .ifNotExists()
    .execute();

  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.execute(db);
  await sql`CREATE INDEX author_search_search_idx ON author_search USING GIN (search gin_trgm_ops)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('author_search_search_idx').ifExists().execute();
  await db.schema.dropTable('author_search').execute();
}
