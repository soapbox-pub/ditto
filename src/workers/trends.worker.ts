/// <reference lib="webworker" />
import { Database as Sqlite } from '@db/sqlite';
import { NSchema } from '@nostrify/nostrify';
import { DenoSqlite3Dialect } from '@soapbox/kysely-deno-sqlite';
import { Kysely, sql } from 'kysely';
import * as Comlink from 'comlink';

import { hashtagSchema } from '@/schema.ts';
import { generateDateRange, Time } from '@/utils/time.ts';

interface GetTrendingTagsOpts {
  since: Date;
  until: Date;
  limit?: number;
  threshold?: number;
}

interface GetTagHistoryOpts {
  tag: string;
  since: Date;
  until: Date;
  limit?: number;
  offset?: number;
}

interface TagsDB {
  tag_usages: {
    tag: string;
    pubkey8: string;
    inserted_at: number;
  };
}

let kysely: Kysely<TagsDB>;

export const TrendsWorker = {
  async open(path: string) {
    kysely = new Kysely({
      dialect: new DenoSqlite3Dialect({
        database: new Sqlite(path),
      }),
    });

    await kysely.schema
      .createTable('tag_usages')
      .ifNotExists()
      .addColumn('tag', 'text', (c) => c.notNull().modifyEnd(sql`collate nocase`))
      .addColumn('pubkey8', 'text', (c) => c.notNull())
      .addColumn('inserted_at', 'integer', (c) => c.notNull())
      .execute();

    await kysely.schema
      .createIndex('idx_time_tag')
      .ifNotExists()
      .on('tag_usages')
      .column('inserted_at')
      .column('tag')
      .execute();

    Deno.cron('cleanup tag usages older than a week', { hour: { every: 1 } }, async () => {
      const lastWeek = new Date(new Date().getTime() - Time.days(7));
      await this.cleanupTagUsages(lastWeek);
    });
  },

  /** Gets the most used hashtags between the date range. */
  async getTrendingTags({ since, until, limit = 10, threshold = 3 }: GetTrendingTagsOpts): Promise<{
    tag: string;
    accounts: number;
    uses: number;
  }[]> {
    return await kysely.selectFrom('tag_usages')
      .select(({ fn }) => [
        'tag',
        fn.agg<number>('count', ['pubkey8']).distinct().as('accounts'),
        fn.countAll<number>().as('uses'),
      ])
      .where('inserted_at', '>=', since.valueOf())
      .where('inserted_at', '<', until.valueOf())
      .groupBy('tag')
      .having((c) => c(c.fn.agg('count', ['pubkey8']).distinct(), '>=', threshold))
      .orderBy((c) => c.fn.agg('count', ['pubkey8']).distinct(), 'desc')
      .limit(limit)
      .execute();
  },

  /**
   * Gets the tag usage count for a specific tag.
   * It returns an array with counts for each date between the range.
   */
  async getTagHistory({ tag, since, until, limit = 7, offset = 0 }: GetTagHistoryOpts) {
    const result = await kysely
      .selectFrom('tag_usages')
      .select(({ fn }) => [
        'inserted_at',
        fn.agg<number>('count', ['pubkey8']).distinct().as('accounts'),
        fn.countAll<number>().as('uses'),
      ])
      .where('tag', '=', tag)
      .where('inserted_at', '>=', since.valueOf())
      .where('inserted_at', '<', until.valueOf())
      .groupBy(sql`inserted_at`)
      .orderBy(sql`inserted_at`, 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    /** Full date range between `since` and `until`. */
    const dateRange = generateDateRange(
      new Date(since.getTime() + Time.days(1)),
      new Date(until.getTime() - Time.days(offset)),
    ).reverse();

    // Fill in missing dates with 0 usages.
    return dateRange.map((day) => {
      const data = result.find((item) => new Date(item.inserted_at).getTime() === day.getTime());
      if (data) {
        return { ...data, day: new Date(data.inserted_at) };
      }
      return { day, accounts: 0, uses: 0 };
    });
  },

  async addTagUsages(pubkey: string, hashtags: string[], inserted_at = new Date().valueOf()): Promise<void> {
    const pubkey8 = NSchema.id().parse(pubkey).substring(0, 8);
    const tags = hashtagSchema.array().min(1).parse(hashtags);

    await kysely
      .insertInto('tag_usages')
      .values(tags.map((tag) => ({ tag, pubkey8, inserted_at })))
      .execute();
  },

  async cleanupTagUsages(until: Date): Promise<void> {
    await kysely
      .deleteFrom('tag_usages')
      .where('inserted_at', '<', until.valueOf())
      .execute();
  },
};

Comlink.expose(TrendsWorker);

self.postMessage('ready');
