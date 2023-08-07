import { Kysely, Sqlite } from '@/deps.ts';
import { DenoSqliteDialect } from '../../lib/kysely-deno-sqlite/mod.ts';

interface Tables {
  events: EventsTable;
  tags: TagsTable;
  users: UsersTable;
}

interface EventsTable {
  id: string;
  kind: number;
  pubkey: string;
  content: string;
  created_at: number;
  tags: string;
  sig: string;
}

interface TagsTable {
  tag: string;
  value_1: string | null;
  value_2: string | null;
  value_3: string | null;
  event_id: string;
}

interface UsersTable {
  pubkey: string;
  username: string;
  inserted_at: Date;
}

const builder = new Kysely<Tables>({
  dialect: new DenoSqliteDialect({
    database: new Sqlite('data/db.sqlite3'),
  }),
});

export { builder };
