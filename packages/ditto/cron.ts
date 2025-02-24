import { sql } from 'kysely';

import {
  type TrendsCtx,
  updateTrendingEvents,
  updateTrendingHashtags,
  updateTrendingLinks,
  updateTrendingPubkeys,
  updateTrendingZappedEvents,
} from '@/trends.ts';

/** Start cron jobs for the application. */
export function cron(ctx: TrendsCtx) {
  Deno.cron('update trending pubkeys', '0 * * * *', () => updateTrendingPubkeys(ctx));
  Deno.cron('update trending zapped events', '7 * * * *', () => updateTrendingZappedEvents(ctx));
  Deno.cron('update trending events', '15 * * * *', () => updateTrendingEvents(ctx));
  Deno.cron('update trending hashtags', '30 * * * *', () => updateTrendingHashtags(ctx));
  Deno.cron('update trending links', '45 * * * *', () => updateTrendingLinks(ctx));

  Deno.cron('refresh top authors', '20 * * * *', async () => {
    const { kysely } = ctx.db;
    await sql`refresh materialized view top_authors`.execute(kysely);
  });
}
