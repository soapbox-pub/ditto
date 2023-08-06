import { Sqlite } from '@/deps.ts';

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
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        kind INTEGER NOT NULL,
        pubkey TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        tags TEXT NOT NULL,
        sig TEXT NOT NULL
      );
      
      CREATE INDEX idx_events_kind ON events(kind);
      CREATE INDEX idx_events_pubkey ON events(pubkey);
      
      CREATE TABLE tags (
        tag TEXT NOT NULL,
        value_1 TEXT,
        value_2 TEXT,
        value_3 TEXT,
        event_id TEXT NOT NULL,
        FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
      );
      
      CREATE INDEX idx_tags_tag ON tags(tag);
      CREATE INDEX idx_tags_value_1 ON tags(value_1);
      CREATE INDEX idx_tags_event_id ON tags(event_id);
      
      CREATE TABLE users (
        pubkey TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        inserted_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE UNIQUE INDEX idx_users_username ON users(username);
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
}

const db = new DittoDB(
  new Sqlite('data/db.sqlite3'),
);
export { db };
