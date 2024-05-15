import uuid62 from 'uuid62';

import { DittoDB } from '@/db/DittoDB.ts';
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

  const kysely = await DittoDB.getInstance();
  await kysely.insertInto('unattached_media')
    .values({ ...result, data: JSON.stringify(media.data) })
    .execute();

  return result;
}

/** Select query for unattached media. */
async function selectUnattachedMediaQuery() {
  const kysely = await DittoDB.getInstance();
  return kysely.selectFrom('unattached_media')
    .select([
      'unattached_media.id',
      'unattached_media.pubkey',
      'unattached_media.url',
      'unattached_media.data',
      'unattached_media.uploaded_at',
    ]);
}

/** Find attachments that exist but aren't attached to any events. */
async function getUnattachedMedia(until: Date) {
  const query = await selectUnattachedMediaQuery();
  return query
    .leftJoin('nostr_tags', 'unattached_media.url', 'nostr_tags.value')
    .where('uploaded_at', '<', until.getTime())
    .execute();
}

/** Delete unattached media by URL. */
async function deleteUnattachedMediaByUrl(url: string) {
  const kysely = await DittoDB.getInstance();
  return kysely.deleteFrom('unattached_media')
    .where('url', '=', url)
    .execute();
}

/** Get unattached media by IDs. */
async function getUnattachedMediaByIds(ids: string[]) {
  if (!ids.length) return [];
  const query = await selectUnattachedMediaQuery();
  return query
    .where('id', 'in', ids)
    .execute();
}

/** Delete rows as an event with media is being created. */
async function deleteAttachedMedia(pubkey: string, urls: string[]): Promise<void> {
  if (!urls.length) return;
  const kysely = await DittoDB.getInstance();
  await kysely.deleteFrom('unattached_media')
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
