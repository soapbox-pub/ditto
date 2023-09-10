import { db } from '@/db.ts';
import { uuid62 } from '@/deps.ts';
import { type MediaData } from '@/schemas/nostr.ts';

interface UnattachedMedia {
  id: string;
  pubkey: string;
  url: string;
  data: MediaData;
  uploaded_at: Date;
}

/** Add unattached media into the database. */
async function insertUnattachedMedia(media: Omit<UnattachedMedia, 'id' | 'uploaded_at'>) {
  const result = {
    id: uuid62.v4(),
    uploaded_at: new Date(),
    ...media,
  };

  await db.insertInto('unattached_media')
    .values({ ...result, data: JSON.stringify(media.data) })
    .execute();

  return result;
}

/** Select query for unattached media. */
function selectUnattachedMediaQuery() {
  return db.selectFrom('unattached_media')
    .select([
      'unattached_media.id',
      'unattached_media.pubkey',
      'unattached_media.url',
      'unattached_media.data',
      'unattached_media.uploaded_at',
    ]);
}

/** Find attachments that exist but aren't attached to any events. */
function getUnattachedMedia(until: Date) {
  return selectUnattachedMediaQuery()
    .leftJoin('tags', 'unattached_media.url', 'tags.value')
    .where('uploaded_at', '<', until)
    .execute();
}

/** Delete unattached media by URL. */
function deleteUnattachedMediaByUrl(url: string) {
  return db.deleteFrom('unattached_media')
    .where('url', '=', url)
    .execute();
}

/** Get unattached media by IDs. */
function getUnattachedMediaByIds(ids: string[]) {
  return selectUnattachedMediaQuery()
    .where('id', 'in', ids)
    .execute();
}

export {
  deleteUnattachedMediaByUrl,
  getUnattachedMedia,
  getUnattachedMediaByIds,
  insertUnattachedMedia,
  type UnattachedMedia,
};
