import { Sqlite } from '@/deps.ts';

class TrendsDB {
  #db: Sqlite;

  constructor(db: Sqlite) {
    this.#db = db;

    this.#db.execute(`
      CREATE TABLE IF NOT EXISTS tag_usages (
        tag TEXT NOT NULL,
        pubkey8 TEXT NOT NULL,
        inserted_at DATETIME NOT NULL,
      );

      CREATE INDEX IF NOT EXISTS idx_time_tag ON tag_usages(inserted_at, tag);
    `);
  }

  getTrendingTags(since: Date, until: Date): string[] {
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
    ).map((row) => row[0]);
  }

  addTagUsage(tag: string, pubkey8: string): void {
    this.#db.query(
      'INSERT INTO tag_usages (tag, pubkey8, inserted_at) VALUES (?, ?, ?)',
      [tag, pubkey8, new Date()],
    );
  }

  cleanupTagUsages(until: Date): void {
    this.#db.query(
      'DELETE FROM tag_usages WHERE inserted_at < ?',
      [until],
    );
  }
}

export { TrendsDB };
