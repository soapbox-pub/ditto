import { Kysely, sql } from 'kysely';

import { Conf } from '@/config.ts';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('events').renameTo('nostr_events').execute();
  await db.schema.alterTable('tags').renameTo('nostr_tags').execute();
  await db.schema.alterTable('nostr_tags').renameColumn('tag', 'name').execute();

  if (Conf.databaseUrl.protocol === 'sqlite:') {
    await db.schema.dropTable('events_fts').execute();
    await sql`CREATE VIRTUAL TABLE nostr_fts5 USING fts5(event_id, content)`.execute(db);
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('nostr_events').renameTo('events').execute();
  await db.schema.alterTable('nostr_tags').renameTo('tags').execute();
  await db.schema.alterTable('tags').renameColumn('name', 'tag').execute();

  if (Conf.databaseUrl.protocol === 'sqlite:') {
    await db.schema.dropTable('nostr_fts5').execute();
    await sql`CREATE VIRTUAL TABLE events_fts USING fts5(id, content)`.execute(db);
  }
}
