import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('nip46_tokens')
    .addColumn('api_token', 'text', (col) => col.primaryKey().notNull())
    .addColumn('user_pubkey', 'text', (col) => col.notNull())
    .addColumn('server_seckey', 'bytea', (col) => col.notNull())
    .addColumn('server_pubkey', 'text', (col) => col.notNull())
    .addColumn('relays', 'text', (col) => col.defaultTo('[]'))
    .addColumn('connected_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('nip46_tokens').execute();
}
