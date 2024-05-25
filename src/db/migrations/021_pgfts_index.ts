import { Kysely } from 'kysely';

import { Conf } from '@/config.ts';

export async function up(db: Kysely<any>): Promise<void> {
  if (Conf.db.dialect === 'postgres') {
    await db.schema
      .createIndex('nostr_pgfts_gin_search_vec')
      .ifNotExists()
      .on('nostr_pgfts')
      .using('gin')
      .column('search_vec')
      .execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  if (Conf.db.dialect === 'postgres') {
    await db.schema.dropIndex('nostr_pgfts_gin_search_vec').ifExists().execute();
  }
}
