import * as eventsDB from '@/db/events.ts';
import { cron } from '@/deps.ts';
import { Time } from '@/utils/time.ts';

/** Clean up old remote events. */
async function cleanupEvents() {
  console.log('Cleaning up old remote events...');

  const [result] = await eventsDB.deleteFilters([{
    until: Math.floor((Date.now() - Time.days(7)) / 1000),
    local: false,
  }]);

  console.log(`Deleted ${result?.numDeletedRows ?? 0} events.`);
}

cron.every15Minute(cleanupEvents);
