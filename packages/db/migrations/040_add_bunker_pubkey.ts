import type { Kysely } from 'kysely';

// deno-lint-ignore no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('auth_tokens')
    .addColumn('bunker_pubkey', 'char(64)')
    .execute();

  await db.updateTable('auth_tokens').set((eb) => ({ bunker_pubkey: eb.ref('pubkey') })).execute();

  await db.schema
    .alterTable('auth_tokens')
    .alterColumn('bunker_pubkey', (col) => col.setNotNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('auth_tokens')
    .dropColumn('bunker_pubkey')
    .execute();
}
