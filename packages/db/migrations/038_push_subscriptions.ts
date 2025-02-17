import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('push_subscriptions')
    .addColumn('id', 'bigserial', (c) => c.primaryKey())
    .addColumn('pubkey', 'char(64)', (c) => c.notNull())
    .addColumn('token_hash', 'bytea', (c) => c.references('auth_tokens.token_hash').onDelete('cascade').notNull())
    .addColumn('endpoint', 'text', (c) => c.notNull())
    .addColumn('p256dh', 'text', (c) => c.notNull())
    .addColumn('auth', 'text', (c) => c.notNull())
    .addColumn('data', 'jsonb')
    .addColumn('created_at', 'timestamp', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'timestamp', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createIndex('push_subscriptions_token_hash_idx')
    .on('push_subscriptions')
    .column('token_hash')
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('push_subscriptions').execute();
}
