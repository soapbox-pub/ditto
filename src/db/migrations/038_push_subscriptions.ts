import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('push_subscriptions')
    .addColumn('id', 'bigint', (c) => c.primaryKey().autoIncrement())
    .addColumn('pubkey', 'char(64)', (c) => c.notNull())
    .addColumn('token', 'char(64)', (c) => c.notNull())
    .addColumn('endpoint', 'text', (c) => c.notNull())
    .addColumn('p256dh', 'text', (c) => c.notNull())
    .addColumn('auth', 'text', (c) => c.notNull())
    .addColumn('data', 'jsonb')
    .addColumn('created_at', 'timestamp', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'timestamp', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('push_subscriptions').execute();
}
