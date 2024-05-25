import { Kysely, sql } from 'kysely';

import { Conf } from '@/config.ts';

export async function up(db: Kysely<any>): Promise<void> {
  if (Conf.db.dialect === 'postgres') {
    await db.schema.createTable('nostr_pgfts')
      .ifNotExists()
      .addColumn('event_id', 'text', (c) => c.primaryKey().references('nostr_events.id').onDelete('cascade'))
      .addColumn('search_vec', sql`tsvector`, (c) => c.notNull())
      .execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  if (Conf.db.dialect === 'postgres') {
    await db.schema.dropTable('nostr_pgfts').ifExists().execute();
  }
}
