import uuid62 from 'uuid62';

import { db } from '@/db.ts';
import { type MediaData } from '@/schemas/nostr.ts';

interface UnattachedMedia {
  id: string;
  pubkey: string;
  url: string;
  data: MediaData;
  uploaded_at: number;
}

/** Add unattached media into the database. */
async function insertUnattachedMedia(media: Omit<UnattachedMedia, 'id' | 'uploaded_at'>) {
  const result = {
    id: uuid62.v4(),
    uploaded_at: Date.now(),
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
    .where('uploaded_at', '<', until.getTime())
    .execute();
}

/** Delete unattached media by URL. */
function deleteUnattachedMediaByUrl(url: string) {
  return db.deleteFrom('unattached_media')
    .where('url', '=', url)
    .execute();
}

/** Get unattached media by IDs. */
// deno-lint-ignore require-await
async function getUnattachedMediaByIds(ids: string[]) {
  if (!ids.length) return [];
  return selectUnattachedMediaQuery()
    .where('id', 'in', ids)
    .execute();
}

/** Delete rows as an event with media is being created. */
async function deleteAttachedMedia(pubkey: string, urls: string[]): Promise<void> {
  if (!urls.length) return;
  await db.deleteFrom('unattached_media')
    .where('pubkey', '=', pubkey)
    .where('url', 'in', urls)
    .execute();
}

export {
  deleteAttachedMedia,
  deleteUnattachedMediaByUrl,
  getUnattachedMedia,
  getUnattachedMediaByIds,
  insertUnattachedMedia,
  type UnattachedMedia,
};
