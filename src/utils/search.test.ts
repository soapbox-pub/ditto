import { assertEquals } from '@std/assert';

import { createTestDB, genEvent } from '@/test.ts';
import { getIdsBySearch, getPubkeysBySearch } from '@/utils/search.ts';

Deno.test('fuzzy search works', async () => {
  await using db = await createTestDB();

  await db.kysely.insertInto('author_stats').values({
    pubkey: '47259076c85f9240e852420d7213c95e95102f1de929fb60f33a2c32570c98c4',
    search: 'patrickReiis patrickdosreis.com',
    notes_count: 0,
    followers_count: 0,
    following_count: 0,
  }).execute();

  assertEquals(
    await getPubkeysBySearch(db.kysely, { q: 'pat rick', limit: 1, offset: 0, followedPubkeys: new Set() }),
    new Set(),
  );
  assertEquals(
    await getPubkeysBySearch(db.kysely, { q: 'patrick dosreis', limit: 1, offset: 0, followedPubkeys: new Set() }),
    new Set([
      '47259076c85f9240e852420d7213c95e95102f1de929fb60f33a2c32570c98c4',
    ]),
  );
  assertEquals(
    await getPubkeysBySearch(db.kysely, { q: 'dosreis.com', limit: 1, offset: 0, followedPubkeys: new Set() }),
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

  assertEquals(
    await getPubkeysBySearch(db.kysely, { q: 'dosreis.com', limit: 1, offset: 1, followedPubkeys: new Set() }),
    new Set(),
  );
});

Deno.test('Searching for posts work', async () => {
  await using db = await createTestDB();

  const event = genEvent({ content: "I'm not an orphan. Death is my importance", kind: 1 });
  await db.store.event(event);
  await db.kysely.updateTable('nostr_events').set('search_ext', { language: 'en' }).where('id', '=', event.id)
    .execute();

  const event2 = genEvent({ content: 'The more I explore is the more I fall in love with the music I make.', kind: 1 });
  await db.store.event(event2);
  await db.kysely.updateTable('nostr_events').set('search_ext', { language: 'en' }).where('id', '=', event2.id)
    .execute();

  assertEquals(
    await getIdsBySearch(db.kysely, { q: 'Death is my importance', limit: 1, offset: 0 }), // ordered words
    new Set([event.id]),
  );

  assertEquals(
    await getIdsBySearch(db.kysely, { q: 'make I music', limit: 1, offset: 0 }), // reversed words
    new Set([event2.id]),
  );

  assertEquals(
    await getIdsBySearch(db.kysely, { q: 'language:en make I music', limit: 10, offset: 0 }), // reversed words, english
    new Set([event2.id]),
  );

  assertEquals(
    await getIdsBySearch(db.kysely, { q: 'language:en an orphan', limit: 10, offset: 0 }), // all posts in english plus search
    new Set([event.id]),
  );

  assertEquals(
    await getIdsBySearch(db.kysely, { q: 'language:en', limit: 10, offset: 0 }), // all posts in english
    new Set([event.id, event2.id]),
  );

  assertEquals(
    await getIdsBySearch(db.kysely, { q: '', limit: 10, offset: 0 }),
    new Set(),
  );
});
