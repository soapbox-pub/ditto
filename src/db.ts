import { DenoSqliteDialect, Kysely, Sqlite } from '@/deps.ts';

interface Tables {
  events: EventRow;
  tags: TagRow;
  users: UserRow;
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

const sqlite = new Sqlite('data/db.sqlite3');

// TODO: move this into a proper migration
sqlite.execute(`
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    kind INTEGER NOT NULL,
    pubkey TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    tags TEXT NOT NULL,
    sig TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);
  CREATE INDEX IF NOT EXISTS idx_events_pubkey ON events(pubkey);

  CREATE TABLE IF NOT EXISTS tags (
    tag TEXT NOT NULL,
    value_1 TEXT,
    value_2 TEXT,
    value_3 TEXT,
    event_id TEXT NOT NULL,
    FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
  CREATE INDEX IF NOT EXISTS idx_tags_value_1 ON tags(value_1);
  CREATE INDEX IF NOT EXISTS idx_tags_event_id ON tags(event_id);

  CREATE TABLE IF NOT EXISTS users (
    pubkey TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    inserted_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
`);

const db = new Kysely<Tables>({
  dialect: new DenoSqliteDialect({
    database: sqlite,
  }),
});

export { db, type EventRow, type TagRow, type UserRow };
