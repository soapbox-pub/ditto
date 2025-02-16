import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('domain_favicons')
    .addColumn('domain', 'varchar(253)', (col) => col.primaryKey())
    .addColumn('favicon', 'varchar(2048)', (col) => col.notNull())
    .addColumn('last_updated_at', 'integer', (col) => col.notNull())
    .addCheckConstraint('domain_favicons_https_chk', sql`favicon ~* '^https:\\/\\/'`)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('domain_favicons').execute();
}
