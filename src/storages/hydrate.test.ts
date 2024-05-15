import { assertEquals } from '@std/assert';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { MockRelay } from '@nostrify/nostrify/test';

import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { eventFixture } from '@/test.ts';

Deno.test('hydrateEvents(): author --- WITHOUT stats', async () => {
  const db = new MockRelay();

  const event0 = await eventFixture('event-0');
  const event1 = await eventFixture('event-1');

  // Save events to database
  await db.event(event0);
  await db.event(event1);

  await hydrateEvents({
    events: [event1],
    store: db,
  });

  const expectedEvent = { ...event1, author: event0 };
  assertEquals(event1, expectedEvent);
});

Deno.test('hydrateEvents(): repost --- WITHOUT stats', async () => {
  const db = new MockRelay();

  const event0madePost = await eventFixture('event-0-the-one-who-post-and-users-repost');
  const event0madeRepost = await eventFixture('event-0-the-one-who-repost');
  const event1reposted = await eventFixture('event-1-reposted');
  const event6 = await eventFixture('event-6');

  // Save events to database
  await db.event(event0madePost);
  await db.event(event0madeRepost);
  await db.event(event1reposted);
  await db.event(event6);

  await hydrateEvents({
    events: [event6],
    store: db,
  });

  const expectedEvent6 = {
    ...event6,
    author: event0madeRepost,
    repost: { ...event1reposted, author: event0madePost },
  };
  assertEquals(event6, expectedEvent6);
});

Deno.test('hydrateEvents(): quote repost --- WITHOUT stats', async () => {
  const db = new MockRelay();

  const event0madeQuoteRepost = await eventFixture('event-0-the-one-who-quote-repost');
  const event0 = await eventFixture('event-0');
  const event1quoteRepost = await eventFixture('event-1-quote-repost');
  const event1willBeQuoteReposted = await eventFixture('event-1-that-will-be-quote-reposted');

  // Save events to database
  await db.event(event0madeQuoteRepost);
  await db.event(event0);
  await db.event(event1quoteRepost);
  await db.event(event1willBeQuoteReposted);

  await hydrateEvents({
    events: [event1quoteRepost],
    store: db,
  });

  const expectedEvent1quoteRepost = {
    ...event1quoteRepost,
    author: event0madeQuoteRepost,
    quote: { ...event1willBeQuoteReposted, author: event0 },
  };

  assertEquals(event1quoteRepost, expectedEvent1quoteRepost);
});

Deno.test('hydrateEvents(): repost of quote repost --- WITHOUT stats', async () => {
  const db = new MockRelay();

  const author = await eventFixture('event-0-makes-repost-with-quote-repost');
  const event1 = await eventFixture('event-1-will-be-reposted-with-quote-repost');
  const event6 = await eventFixture('event-6-of-quote-repost');
  const event1quote = await eventFixture('event-1-quote-repost-will-be-reposted');

  // Save events to database
  await db.event(author);
  await db.event(event1);
  await db.event(event1quote);
  await db.event(event6);

  await hydrateEvents({
    events: [event6],
    store: db,
  });

  const expectedEvent6 = {
    ...event6,
    author,
    repost: { ...event1quote, author, quote: { author, ...event1 } },
  };
  assertEquals(event6, expectedEvent6);
});

Deno.test('hydrateEvents(): report pubkey and post // kind 1984 --- WITHOUT stats', async () => {
  const db = new MockRelay();

  const authorDictator = await eventFixture('kind-0-dictator');
  const authorVictim = await eventFixture('kind-0-george-orwell');
  const reportEvent = await eventFixture('kind-1984-dictator-reports-george-orwell');
  const event1 = await eventFixture('kind-1-author-george-orwell');

  // Save events to database
  await db.event(authorDictator);
  await db.event(authorVictim);
  await db.event(reportEvent);
  await db.event(event1);

  await hydrateEvents({
    events: [reportEvent],
    store: db,
  });

  const expectedEvent: DittoEvent = {
    ...reportEvent,
    author: authorDictator,
    reported_notes: [event1],
    reported_profile: authorVictim,
  };
  assertEquals(reportEvent, expectedEvent);
});
