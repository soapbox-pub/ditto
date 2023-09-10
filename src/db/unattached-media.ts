import { db } from '@/db.ts';
import { uuid62 } from '@/deps.ts';

interface UnattachedMedia {
  id: string;
  pubkey: string;
  url: string;
  data: {
    name?: string;
    mime?: string;
    width?: number;
    height?: number;
    size?: number;
    description?: string;
  };
  uploaded_at: Date;
}

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

/** Find attachments that exist but aren't attached to any events. */
function getUnattachedMedia(until: Date) {
  return db.selectFrom('unattached_media')
    .select([
      'unattached_media.id',
      'unattached_media.pubkey',
      'unattached_media.url',
      'unattached_media.data',
      'unattached_media.uploaded_at',
    ])
    .leftJoin('tags', 'unattached_media.url', 'tags.value')
    .where('uploaded_at', '<', until)
    .execute();
}

function deleteUnattachedMediaByUrl(url: string) {
  return db.deleteFrom('unattached_media')
    .where('url', '=', url)
    .execute();
}

function getUnattachedMediaByIds(ids: string[]) {
  return db.selectFrom('unattached_media')
    .select([
      'unattached_media.id',
      'unattached_media.pubkey',
      'unattached_media.url',
      'unattached_media.data',
      'unattached_media.uploaded_at',
    ])
    .where('id', 'in', ids)
    .execute();
}

export { deleteUnattachedMediaByUrl, getUnattachedMedia, getUnattachedMediaByIds, insertUnattachedMedia };
