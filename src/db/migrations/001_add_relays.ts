import { Kysely } from '@/deps.ts';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('relays')
    .addColumn('url', 'text', (col) => col.primaryKey())
    .addColumn('domain', 'text', (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('relays').execute();
}
