import { updateTrendingLinks } from '@/trends.ts';
import { updateTrendingHashtags } from '@/trends.ts';
import { updateTrendingEvents, updateTrendingPubkeys, updateTrendingZappedEvents } from '@/trends.ts';

/** Start cron jobs for the application. */
export function cron() {
  Deno.cron('update trending pubkeys', '0 * * * *', updateTrendingPubkeys);
  Deno.cron('update trending zapped events', '7 * * * *', updateTrendingZappedEvents);
  Deno.cron('update trending events', '15 * * * *', updateTrendingEvents);
  Deno.cron('update trending hashtags', '30 * * * *', updateTrendingHashtags);
  Deno.cron('update trending links', '45 * * * *', updateTrendingLinks);
}
