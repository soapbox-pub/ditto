import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('nostr_events')
    .addColumn('search_ext', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .execute();

  await db.schema
    .alterTable('nostr_events')
    .addCheckConstraint('nostr_events_search_ext_chk', sql`jsonb_typeof(search_ext) = 'object'`)
    .execute();

  await db.schema
    .createIndex('nostr_events_search_ext_idx').using('gin')
    .on('nostr_events')
    .column('search_ext')
    .ifNotExists()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .dropIndex('nostr_events_search_ext_idx')
    .on('nostr_events')
    .ifExists()
    .execute();

  await db.schema
    .alterTable('nostr_events')
    .dropConstraint('nostr_events_search_ext_chk')
    .execute();

  await db.schema
    .alterTable('nostr_events')
    .dropColumn('search_ext')
    .execute();
}
