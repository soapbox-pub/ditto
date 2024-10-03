import { Kysely, sql } from 'kysely';

import { encryptSecretKey, getTokenHash } from '@/utils/auth.ts';
import { Conf } from '@/config.ts';

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

  // There are probably not that many tokens in the database yet, so this should be fine.
  const tokens = await db.selectFrom('nip46_tokens').selectAll().execute();

  for (const token of tokens) {
    await db.insertInto('auth_tokens').values({
      token_hash: await getTokenHash(token.api_token),
      pubkey: token.user_pubkey,
      nip46_sk_enc: await encryptSecretKey(Conf.seckey, token.server_seckey),
      nip46_relays: JSON.parse(token.relays),
      created_at: token.connected_at,
    }).execute();
  }

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
