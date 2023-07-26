import { Sqlite } from '@/deps.ts';
import { hashtagSchema, hexIdSchema } from '@/schema.ts';
import { Time } from './utils.ts';

interface GetTrendingTagsOpts {
  since: Date;
  until: Date;
  limit?: number;
  threshold?: number;
}

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

    const cleanup = () => {
      console.info('Cleaning up old tag usages...');
      const lastWeek = new Date(new Date().getTime() - Time.days(7));
      this.cleanupTagUsages(lastWeek);
    };

    setInterval(cleanup, Time.hours(1));
    cleanup();
  }

  getTrendingTags({ since, until, limit = 10, threshold = 3 }: GetTrendingTagsOpts) {
    return this.#db.query<string[]>(
      `
      SELECT tag, COUNT(DISTINCT pubkey8), COUNT(*)
        FROM tag_usages
        WHERE inserted_at >= ? AND inserted_at < ?
        GROUP BY tag
        HAVING COUNT(DISTINCT pubkey8) >= ?
        ORDER BY COUNT(DISTINCT pubkey8)
        DESC LIMIT ?;
    `,
      [since, until, threshold, limit],
    ).map((row) => ({
      name: row[0],
      accounts: Number(row[1]),
      uses: Number(row[2]),
    }));
  }

  getTagHistory(tag: string, since: Date, until: Date) {
    return this.#db.query<string[]>(
      `
      SELECT inserted_at, COUNT(DISTINCT pubkey8), COUNT(*)
        FROM tag_usages
        WHERE tag = ? AND inserted_at >= ? AND inserted_at < ?
        GROUP BY date(inserted_at)
        ORDER BY date(inserted_at);
    `,
      [tag, since, until],
    ).map((row) => ({
      day: new Date(row[0]),
      accounts: Number(row[1]),
      uses: Number(row[2]),
    }));
  }

  addTagUsages(pubkey: string, hashtags: string[], date = new Date()): void {
    const pubkey8 = hexIdSchema.parse(pubkey).substring(0, 8);
    const tags = hashtagSchema.array().min(1).parse(hashtags);

    this.#db.query(
      'INSERT INTO tag_usages (tag, pubkey8, inserted_at) VALUES ' + tags.map(() => '(?, ?, ?)').join(', '),
      tags.map((tag) => [tag, pubkey8, date]).flat(),
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
