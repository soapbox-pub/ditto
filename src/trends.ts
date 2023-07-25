import { Sqlite } from '@/deps.ts';
import { hashtagSchema, hexIdSchema } from '@/schema.ts';

class TrendsDB {
  #db: Sqlite;

  constructor(db: Sqlite) {
    this.#db = db;

    this.#db.execute(`
      CREATE TABLE IF NOT EXISTS tag_usages (
        tag TEXT NOT NULL COLLATE NOCASE,
        pubkey8 TEXT NOT NULL,
        inserted_at DATETIME NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_time_tag ON tag_usages(inserted_at, tag);
    `);
  }

  getTrendingTags(since: Date, until: Date) {
    return this.#db.query<string[]>(
      `
      SELECT tag, COUNT(DISTINCT pubkey8)
        FROM tag_usages
        WHERE inserted_at >= ? AND inserted_at < ?
        GROUP BY tag
        ORDER BY COUNT(DISTINCT pubkey8)
        DESC LIMIT 10;
    `,
      [since, until],
    ).map((row) => ({
      name: row[0],
      accounts: Number(row[1]),
    }));
  }

  addTagUsages(pubkey: string, hashtags: string[]): void {
    const pubkey8 = hexIdSchema.parse(pubkey).substring(0, 8);
    const tags = hashtagSchema.array().min(1).parse(hashtags);
    const now = new Date();

    this.#db.query(
      'INSERT INTO tag_usages (tag, pubkey8, inserted_at) VALUES ' + tags.map(() => '(?, ?, ?)').join(', '),
      tags.map((tag) => [tag, pubkey8, now]).flat(),
    );
  }

  cleanupTagUsages(until: Date): void {
    this.#db.query(
      'DELETE FROM tag_usages WHERE inserted_at < ?',
      [until],
    );
  }
}

const trends = new TrendsDB(
  new Sqlite('data/trends.sqlite3'),
);

export { trends, TrendsDB };
