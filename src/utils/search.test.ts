import { assertEquals } from '@std/assert';
import { sql } from 'kysely';

import { createTestDB } from '@/test.ts';
import { getPubkeysBySearch } from '@/utils/search.ts';

Deno.test('fuzzy search works', async () => {
  await using db = await createTestDB();

  await db.kysely.insertInto('author_stats').values({
    pubkey: '47259076c85f9240e852420d7213c95e95102f1de929fb60f33a2c32570c98c4',
    search: 'patrickReiis patrickdosreis.com',
    notes_count: 0,
    followers_count: 0,
    following_count: 0,
  }).execute();

  await sql`REFRESH MATERIALIZED VIEW top_authors`.execute(db.kysely);

  assertEquals(
    await getPubkeysBySearch(db.kysely, { q: 'pat rick', limit: 1, offset: 0, following: new Set() }),
    new Set(),
  );
  assertEquals(
    await getPubkeysBySearch(db.kysely, { q: 'patrick dosreis', limit: 1, offset: 0, following: new Set() }),
    new Set([
      '47259076c85f9240e852420d7213c95e95102f1de929fb60f33a2c32570c98c4',
    ]),
  );
  assertEquals(
    await getPubkeysBySearch(db.kysely, { q: 'dosreis.com', limit: 1, offset: 0, following: new Set() }),
    new Set([
      '47259076c85f9240e852420d7213c95e95102f1de929fb60f33a2c32570c98c4',
    ]),
  );
});

Deno.test('fuzzy search works with offset', async () => {
  await using db = await createTestDB();

  await db.kysely.insertInto('author_stats').values({
    pubkey: '47259076c85f9240e852420d7213c95e95102f1de929fb60f33a2c32570c98c4',
    search: 'abdcef patrickReiis patrickdosreis.com',
    notes_count: 0,
    followers_count: 0,
    following_count: 0,
  }).execute();

  await sql`REFRESH MATERIALIZED VIEW top_authors`.execute(db.kysely);

  assertEquals(
    await getPubkeysBySearch(db.kysely, { q: 'dosreis.com', limit: 1, offset: 1, following: new Set() }),
    new Set(),
  );
});
