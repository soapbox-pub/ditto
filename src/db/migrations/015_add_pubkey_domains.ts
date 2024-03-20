import { Kysely } from '@/deps.ts';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('pubkey_domains')
    .ifNotExists()
    .addColumn('pubkey', 'text', (col) => col.primaryKey())
    .addColumn('domain', 'text')
    .execute();

  await db.schema
    .createIndex('pubkey_domains_domain_index')
    .on('pubkey_domains')
    .column('domain')
    .ifNotExists()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('pubkey_domains').execute();
}
