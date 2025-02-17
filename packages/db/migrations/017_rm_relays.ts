import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('relays').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('relays')
    .addColumn('url', 'text', (col) => col.primaryKey())
    .addColumn('domain', 'text', (col) => col.notNull())
    .addColumn('active', 'boolean', (col) => col.notNull())
    .execute();
}
