import fs from 'node:fs/promises';
import path from 'node:path';

import { DenoSqliteDialect, FileMigrationProvider, Kysely, Migrator, Sqlite } from '@/deps.ts';
import { Conf } from '@/config.ts';

interface DittoDB {
  events: EventRow;
  tags: TagRow;
  users: UserRow;
  relays: RelayRow;
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

interface TagRow {
  tag: string;
  value_1: string | null;
  value_2: string | null;
  value_3: string | null;
  event_id: string;
}

interface UserRow {
  pubkey: string;
  username: string;
  inserted_at: Date;
}

interface RelayRow {
  url: string;
}

const db = new Kysely<DittoDB>({
  dialect: new DenoSqliteDialect({
    database: new Sqlite(Conf.dbPath),
  }),
});

const migrator = new Migrator({
  db,
  provider: new FileMigrationProvider({
    fs,
    path,
    migrationFolder: new URL(import.meta.resolve('./db/migrations')).pathname,
  }),
});

console.log('Running migrations...');
const results = await migrator.migrateToLatest();
console.log('Migrations finished:', results);

export { db, type DittoDB, type EventRow, type TagRow, type UserRow };
