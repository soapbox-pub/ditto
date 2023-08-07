import { builder } from '@/db/builder.ts';
import { type Filter, Sqlite } from '@/deps.ts';
import { SignedEvent } from '@/event.ts';

interface User {
  pubkey: string;
  username: string;
  inserted_at: Date;
}

class DittoDB {
  #db: Sqlite;

  constructor(db: Sqlite) {
    this.#db = db;

    this.#db.execute(`
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
  }

  insertUser(user: Pick<User, 'pubkey' | 'username'>): void {
    this.#db.query(
      'INSERT INTO users(pubkey, username) VALUES (?, ?)',
      [user.pubkey, user.username],
    );
  }

  getUserByUsername(username: string): User | null {
    const result = this.#db.query<[string, string, Date]>(
      'SELECT pubkey, username, inserted_at FROM users WHERE username = ?',
      [username],
    )[0];
    if (!result) return null;
    return {
      pubkey: result[0],
      username: result[1],
      inserted_at: result[2],
    };
  }

  insertEvent(event: SignedEvent): void {
    this.#db.transaction(() => {
      this.#db.query(
        `
        INSERT INTO events(id, kind, pubkey, content, created_at, tags, sig)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        [
          event.id,
          event.kind,
          event.pubkey,
          event.content,
          event.created_at,
          JSON.stringify(event.tags),
          event.sig,
        ],
      );

      for (const [tag, value1, value2, value3] of event.tags) {
        if (['p', 'e', 'q', 'd', 't', 'proxy'].includes(tag)) {
          this.#db.query(
            `
            INSERT INTO tags(event_id, tag, value_1, value_2, value_3)
            VALUES (?, ?, ?, ?, ?)
          `,
            [event.id, tag, value1 || null, value2 || null, value3 || null],
          );
        }
      }
    });
  }

  getFilter<K extends number = number>(filter: Filter<K>) {
  }
}

const db = new DittoDB(
  new Sqlite('data/db.sqlite3'),
);

console.log(await builder.selectFrom('events').selectAll().limit(1).execute())

export { db };
