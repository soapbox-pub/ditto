import { sql } from 'kysely';

import { Storages } from '@/storages.ts';
import {
  updateTrendingEvents,
  updateTrendingHashtags,
  updateTrendingLinks,
  updateTrendingPubkeys,
  updateTrendingZappedEvents,
} from '@/trends.ts';

/** Start cron jobs for the application. */
export function cron() {
  Deno.cron('update trending pubkeys', '0 * * * *', updateTrendingPubkeys);
  Deno.cron('update trending zapped events', '7 * * * *', updateTrendingZappedEvents);
  Deno.cron('update trending events', '15 * * * *', updateTrendingEvents);
  Deno.cron('update trending hashtags', '30 * * * *', updateTrendingHashtags);
  Deno.cron('update trending links', '45 * * * *', updateTrendingLinks);

  Deno.cron('refresh top authors', '20 * * * *', async () => {
    const kysely = await Storages.kysely();
    await sql`refresh materialized view top_authors`.execute(kysely);
  });
}
