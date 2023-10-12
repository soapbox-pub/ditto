import fs from 'node:fs/promises';
import path from 'node:path';

import { DenoSqlite3, DenoSqliteDialect, FileMigrationProvider, Kysely, Migrator, sql } from '@/deps.ts';
import { Conf } from '@/config.ts';

interface DittoDB {
  events: EventRow;
  events_fts: EventFTSRow;
  tags: TagRow;
  users: UserRow;
  relays: RelayRow;
  unattached_media: UnattachedMediaRow;
}

interface EventRow {
  id: string;
  kind: number;
  pubkey: string;
  content: string;
  created_at: number;
  tags: string;
  sig: string;
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

interface UserRow {
  pubkey: string;
  username: string;
  inserted_at: Date;
  admin: 0 | 1;
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

const db = new Kysely<DittoDB>({
  dialect: new DenoSqliteDialect({
    database: new DenoSqlite3(Conf.dbPath),
  }),
});

await Promise.all([
  setPragma(db, 'synchronous', 'normal'),
  setPragma(db, 'temp_store', 'memory'),
  setPragma(db, 'mmap_size', Conf.sqlite.mmapSize),
]);

/** Set the PRAGMA and then read back its value to confirm. */
async function setPragma(db: Kysely<any>, pragma: string, value: string | number) {
  await sql.raw(`PRAGMA ${pragma} = ${value}`).execute(db);
  const result = (await sql.raw(`PRAGMA ${pragma}`).execute(db)).rows[0] as object;

  for (const [key, value] of Object.entries(result)) {
    console.log(`PRAGMA ${key} = ${value};`);
    break;
  }
}

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
  console.log('Running migrations...');
  const results = await migrator.migrateToLatest();

  if (results.error) {
    console.error(results.error);
    Deno.exit(1);
  } else {
    if (!results.results?.length) {
      console.log('Everything up-to-date.');
    } else {
      console.log('Migrations finished!');
      for (const { migrationName, status } of results.results) {
        console.log(`  - ${migrationName}: ${status}`);
      }
    }
  }
}

await migrate();

export { db, type DittoDB, type EventRow, type TagRow, type UserRow };
