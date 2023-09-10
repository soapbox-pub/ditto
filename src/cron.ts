import * as eventsDB from '@/db/events.ts';
import { deleteUnattachedMediaByUrl, getUnattachedMedia } from '@/db/unattached-media.ts';
import { cron } from '@/deps.ts';
import { Time } from '@/utils/time.ts';
import { configUploader as uploader } from '@/uploaders/config.ts';
import { cidFromUrl } from '@/utils/ipfs.ts';

/** Clean up old remote events. */
async function cleanupEvents() {
  console.log('Cleaning up old remote events...');

  const [result] = await eventsDB.deleteFilters([{
    until: Math.floor((Date.now() - Time.days(7)) / 1000),
    local: false,
  }]);

  console.log(`Cleaned up ${result?.numDeletedRows ?? 0} old remote events.`);
}

/** Delete files that aren't attached to any events. */
async function cleanupMedia() {
  console.log('Deleting orphaned media files...');

  const until = new Date(Date.now() - Time.minutes(15));
  const media = await getUnattachedMedia(until);

  for (const { url } of media) {
    const cid = cidFromUrl(new URL(url))!;
    try {
      await uploader.delete(cid);
      await deleteUnattachedMediaByUrl(url);
    } catch (e) {
      console.error(`Failed to delete file ${url}`);
      console.error(e);
    }
  }

  console.log(`Removed ${media?.length ?? 0} orphaned media files.`);
}

await cleanupEvents();
await cleanupMedia();

cron.every15Minute(cleanupEvents);
cron.every15Minute(cleanupMedia);
