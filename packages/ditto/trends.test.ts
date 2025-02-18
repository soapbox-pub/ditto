import { assertEquals } from '@std/assert';
import { genEvent } from '@nostrify/nostrify/test';
import { generateSecretKey, NostrEvent } from 'nostr-tools';

import { getTrendingTagValues } from '@/trends.ts';
import { createTestDB } from '@/test.ts';

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
    for (let j = 0; j < post1multiplier; j++) {
      events.push(
        genEvent({ kind: 7, content: '+', tags: [['e', post1.id, `${j}`]] }, sk),
      );
    }
  }
  events.push(post1);

  sk = generateSecretKey();
  const post2 = genEvent({ kind: 1, content: 'Ithaca' }, sk);
  const numberOfAuthorsWhoLikedPost2 = 100;
  const post2multiplier = 1;
  const post2uses = numberOfAuthorsWhoLikedPost2 * post2multiplier;
  for (let i = 0; i < numberOfAuthorsWhoLikedPost2; i++) {
    const sk = generateSecretKey();
    for (let j = 0; j < post2multiplier; j++) {
      events.push(
        genEvent({ kind: 7, content: '+', tags: [['e', post2.id, `${j}`]] }, sk),
      );
    }
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
    for (let j = 0; j < post1multiplier; j++) {
      events.push(
        genEvent({ kind: 7, content: '+', tags: [['e', post1.id, `${j}`]] }, sk),
      );
    }
  }
  events.push(post1);

  sk = generateSecretKey();
  const post2 = genEvent({ kind: 1, content: 'Ithaca' }, sk);
  const numberOfAuthorsWhoLikedPost2 = 100;
  const post2multiplier = 1;
  for (let i = 0; i < numberOfAuthorsWhoLikedPost2; i++) {
    const sk = generateSecretKey();
    for (let j = 0; j < post2multiplier; j++) {
      events.push(
        genEvent({ kind: 7, content: '+', tags: [['e', post2.id, `${j}`]] }, sk),
      );
    }
  }
  events.push(post2);

  for (const event of events) {
    await db.store.event(event);
  }

  await db.kysely.updateTable('nostr_events')
    .set('search_ext', { language: 'pt' })
    .where('id', '=', post1.id)
    .execute();

  await db.kysely.updateTable('nostr_events')
    .set('search_ext', { language: 'en' })
    .where('id', '=', post2.id)
    .execute();

  const languagesIds = (await db.store.query([{ search: 'language:pt' }])).map((event) => event.id);

  const trends = await getTrendingTagValues(db.kysely, ['e'], { kinds: [1, 7] }, languagesIds);

  // portuguese post
  const expected = [{ value: post1.id, authors: numberOfAuthorsWhoLikedPost1, uses: post1uses }];

  assertEquals(trends, expected);
});
