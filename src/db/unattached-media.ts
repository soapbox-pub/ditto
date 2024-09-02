import { Kysely } from 'kysely';

import { DittoDB } from '@/db/DittoDB.ts';
import { DittoTables } from '@/db/DittoTables.ts';

interface UnattachedMedia {
  id: string;
  pubkey: string;
  url: string;
  /** NIP-94 tags. */
  data: string[][];
  uploaded_at: number;
}

/** Add unattached media into the database. */
async function insertUnattachedMedia(media: UnattachedMedia) {
  const { kysely } = await DittoDB.getInstance();
  await kysely.insertInto('unattached_media')
    .values({ ...media, data: JSON.stringify(media.data) })
    .execute();

  return media;
}

/** Select query for unattached media. */
function selectUnattachedMediaQuery(kysely: Kysely<DittoTables>) {
  return kysely.selectFrom('unattached_media')
    .select([
      'unattached_media.id',
      'unattached_media.pubkey',
      'unattached_media.url',
      'unattached_media.data',
      'unattached_media.uploaded_at',
    ]);
}

/** Delete unattached media by URL. */
async function deleteUnattachedMediaByUrl(url: string) {
  const { kysely } = await DittoDB.getInstance();
  return kysely.deleteFrom('unattached_media')
    .where('url', '=', url)
    .execute();
}

/** Get unattached media by IDs. */
async function getUnattachedMediaByIds(kysely: Kysely<DittoTables>, ids: string[]): Promise<UnattachedMedia[]> {
  if (!ids.length) return [];

  const results = await selectUnattachedMediaQuery(kysely)
    .where('id', 'in', ids)
    .execute();

  return results.map((row) => ({
    ...row,
    data: JSON.parse(row.data),
  }));
}

async function setMediaDescription(id: string, desc = '') {
  const { kysely } = await DittoDB.getInstance();
  const existing = await selectUnattachedMediaQuery(kysely).where('id', '=', id).executeTakeFirst();
  if (!existing) return false;
  const parsed = (await JSON.parse(existing.data) as string[][]).filter((itm) => itm[0] !== 'alt');
  parsed.push(['alt', desc]);
  await kysely.updateTable('unattached_media')
    .set({ data: JSON.stringify(parsed) })
    .execute();
  return true;
}

/** Delete rows as an event with media is being created. */
async function deleteAttachedMedia(pubkey: string, urls: string[]): Promise<void> {
  if (!urls.length) return;
  const { kysely } = await DittoDB.getInstance();
  await kysely.deleteFrom('unattached_media')
    .where('pubkey', '=', pubkey)
    .where('url', 'in', urls)
    .execute();
}

export {
  deleteAttachedMedia,
  deleteUnattachedMediaByUrl,
  getUnattachedMediaByIds,
  insertUnattachedMedia,
  setMediaDescription,
  type UnattachedMedia,
};
