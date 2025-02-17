import { type Kysely, sql } from 'kysely';

interface DB {
  nip46_tokens: {
    api_token: `token1${string}`;
    user_pubkey: string;
    server_seckey: Uint8Array;
    server_pubkey: string;
    relays: string;
    connected_at: Date;
  };
  auth_tokens: {
    token_hash: Uint8Array;
    pubkey: string;
    nip46_sk_enc: Uint8Array;
    nip46_relays: string[];
    created_at: Date;
  };
}

export async function up(db: Kysely<DB>): Promise<void> {
  await db.schema
    .createTable('auth_tokens')
    .addColumn('token_hash', 'bytea', (col) => col.primaryKey())
    .addColumn('pubkey', 'char(64)', (col) => col.notNull())
    .addColumn('nip46_sk_enc', 'bytea', (col) => col.notNull())
    .addColumn('nip46_relays', 'jsonb', (col) => col.defaultTo('[]'))
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema.dropTable('nip46_tokens').execute();
}

export async function down(db: Kysely<DB>): Promise<void> {
  await db.schema.dropTable('auth_tokens').execute();

  await db.schema
    .createTable('nip46_tokens')
    .addColumn('api_token', 'text', (col) => col.primaryKey().unique().notNull())
    .addColumn('user_pubkey', 'text', (col) => col.notNull())
    .addColumn('server_seckey', 'bytea', (col) => col.notNull())
    .addColumn('server_pubkey', 'text', (col) => col.notNull())
    .addColumn('relays', 'text', (col) => col.defaultTo('[]'))
    .addColumn('connected_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
}
