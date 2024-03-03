import fs from 'node:fs/promises';
import path from 'node:path';

import { FileMigrationProvider, Kysely, Migrator, PolySqliteDialect } from '@/deps.ts';
import { Conf } from '@/config.ts';
import { setPragma } from '@/pragma.ts';
import SqliteWorker from '@/workers/sqlite.ts';

interface DittoDB {
  events: EventRow;
  events_fts: EventFTSRow;
  tags: TagRow;
  relays: RelayRow;
  unattached_media: UnattachedMediaRow;
  author_stats: AuthorStatsRow;
  event_stats: EventStatsRow;
}

interface AuthorStatsRow {
  pubkey: string;
  followers_count: number;
  following_count: number;
  notes_count: number;
}

interface EventStatsRow {
  event_id: string;
  replies_count: number;
  reposts_count: number;
  reactions_count: number;
}

interface EventRow {
  id: string;
  kind: number;
  pubkey: string;
  content: string;
  created_at: number;
  tags: string;
  sig: string;
  deleted_at: number | null;
}

interface EventFTSRow {
  id: string;
  content: string;
}

interface TagRow {
  tag: string;
  value: string;
  event_id: string;
}

interface RelayRow {
  url: string;
  domain: string;
  active: boolean;
}

interface UnattachedMediaRow {
  id: string;
  pubkey: string;
  url: string;
  data: string;
  uploaded_at: Date;
}

const sqliteWorker = new SqliteWorker();
await sqliteWorker.open(Conf.dbPath);

const db = new Kysely<DittoDB>({
  dialect: new PolySqliteDialect({
    database: sqliteWorker,
  }),
});

// Set PRAGMA values.
await Promise.all([
  setPragma(db, 'synchronous', 'normal'),
  setPragma(db, 'temp_store', 'memory'),
  setPragma(db, 'mmap_size', Conf.sqlite.mmapSize),
]);

const migrator = new Migrator({
  db,
  provider: new FileMigrationProvider({
    fs,
    path,
    migrationFolder: new URL(import.meta.resolve('./db/migrations')).pathname,
  }),
});

/** Migrate the database to the latest version. */
async function migrate() {
  console.info('Running migrations...');
  const results = await migrator.migrateToLatest();

  if (results.error) {
    console.error(results.error);
    Deno.exit(1);
  } else {
    if (!results.results?.length) {
      console.info('Everything up-to-date.');
    } else {
      console.info('Migrations finished!');
      for (const { migrationName, status } of results.results!) {
        console.info(`  - ${migrationName}: ${status}`);
      }
    }
  }
}

await migrate();

export { type AuthorStatsRow, db, type DittoDB, type EventRow, type EventStatsRow, type TagRow };
