import { assertEquals } from '@std/assert';
import { generateSecretKey, NostrEvent } from 'nostr-tools';

import { getTrendingTagValues } from '@/trends.ts';
import { createTestDB, genEvent } from '@/test.ts';

Deno.test("getTrendingTagValues(): 'e' tag and WITHOUT language parameter", async () => {
  await using db = await createTestDB();

  const events: NostrEvent[] = [];

  let sk = generateSecretKey();
  const post1 = genEvent({ kind: 1, content: 'SHOW ME THE MONEY' }, sk);
  const numberOfAuthorsWhoLikedPost1 = 100;
  const post1multiplier = 2;
  const post1uses = numberOfAuthorsWhoLikedPost1 * post1multiplier;
  for (let i = 0; i < numberOfAuthorsWhoLikedPost1; i++) {
    const sk = generateSecretKey();
    events.push(
      genEvent({ kind: 7, content: '+', tags: Array(post1multiplier).fill([...['e', post1.id]]) }, sk),
    );
  }
  events.push(post1);

  sk = generateSecretKey();
  const post2 = genEvent({ kind: 1, content: 'Ithaca' }, sk);
  const numberOfAuthorsWhoLikedPost2 = 100;
  const post2multiplier = 1;
  const post2uses = numberOfAuthorsWhoLikedPost2 * post2multiplier;
  for (let i = 0; i < numberOfAuthorsWhoLikedPost2; i++) {
    const sk = generateSecretKey();
    events.push(
      genEvent({ kind: 7, content: '+', tags: Array(post2multiplier).fill([...['e', post2.id]]) }, sk),
    );
  }
  events.push(post2);

  for (const event of events) {
    await db.store.event(event);
  }

  const trends = await getTrendingTagValues(db.kysely, ['e'], { kinds: [1, 7] });

  const expected = [{ value: post1.id, authors: numberOfAuthorsWhoLikedPost1, uses: post1uses }, {
    value: post2.id,
    authors: numberOfAuthorsWhoLikedPost2,
    uses: post2uses,
  }];

  assertEquals(trends, expected);
});

Deno.test("getTrendingTagValues(): 'e' tag and WITH language parameter", async () => {
  await using db = await createTestDB();

  const events: NostrEvent[] = [];

  let sk = generateSecretKey();
  const post1 = genEvent({ kind: 1, content: 'Irei cortar o cabelo.' }, sk);
  const numberOfAuthorsWhoLikedPost1 = 100;
  const post1multiplier = 2;
  const post1uses = numberOfAuthorsWhoLikedPost1 * post1multiplier;
  for (let i = 0; i < numberOfAuthorsWhoLikedPost1; i++) {
    const sk = generateSecretKey();
    events.push(
      genEvent({ kind: 7, content: '+', tags: Array(post1multiplier).fill([...['e', post1.id]]) }, sk),
    );
  }
  events.push(post1);

  sk = generateSecretKey();
  const post2 = genEvent({ kind: 1, content: 'Ithaca' }, sk);
  const numberOfAuthorsWhoLikedPost2 = 100;
  const post2multiplier = 1;
  for (let i = 0; i < numberOfAuthorsWhoLikedPost2; i++) {
    const sk = generateSecretKey();
    events.push(
      genEvent({ kind: 7, content: '+', tags: Array(post2multiplier).fill([...['e', post2.id]]) }, sk),
    );
  }
  events.push(post2);

  for (const event of events) {
    await db.store.event(event);
  }

  await db.kysely.updateTable('nostr_events')
    .set('language', 'pt')
    .where('id', '=', post1.id)
    .execute();

  await db.kysely.updateTable('nostr_events')
    .set('language', 'en')
    .where('id', '=', post2.id)
    .execute();

  const trends = await getTrendingTagValues(db.kysely, ['e'], { kinds: [1, 7] }, 'pt');

  // portuguese post
  const expected = [{ value: post1.id, authors: numberOfAuthorsWhoLikedPost1, uses: post1uses }];

  assertEquals(trends, expected);
});
