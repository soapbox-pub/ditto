import { assertEquals } from '@std/assert';

import { createTestDB } from '@/test.ts';
import { getPubkeysBySearch } from '@/utils/search.ts';

Deno.test('fuzzy search works', async () => {
  await using db = await createTestDB();

  await db.kysely.insertInto('author_search').values({
    pubkey: '47259076c85f9240e852420d7213c95e95102f1de929fb60f33a2c32570c98c4',
    search: 'patrickReiis patrickdosreis.com',
  }).execute();

  assertEquals(await getPubkeysBySearch(db.kysely, { q: 'pat rick', limit: 1, followedPubkeys: new Set() }), new Set());
  assertEquals(
    await getPubkeysBySearch(db.kysely, { q: 'patrick dosreis', limit: 1, followedPubkeys: new Set() }),
    new Set([
      '47259076c85f9240e852420d7213c95e95102f1de929fb60f33a2c32570c98c4',
    ]),
  );
  assertEquals(
    await getPubkeysBySearch(db.kysely, { q: 'dosreis.com', limit: 1, followedPubkeys: new Set() }),
    new Set([
      '47259076c85f9240e852420d7213c95e95102f1de929fb60f33a2c32570c98c4',
    ]),
  );
});
