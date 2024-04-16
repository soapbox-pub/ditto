import { assertEquals } from '@/deps-test.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { NCache } from 'jsr:@nostrify/nostrify';

import event0 from '~/fixtures/events/event-0.json' with { type: 'json' };
import event0madePost from '~/fixtures/events/event-0-the-one-who-post-and-users-repost.json' with { type: 'json' };
import event0madeRepost from '~/fixtures/events/event-0-the-one-who-repost.json' with { type: 'json' };
import event0madeQuoteRepost from '~/fixtures/events/event-0-the-one-who-quote-repost.json' with { type: 'json' };
import event1 from '~/fixtures/events/event-1.json' with { type: 'json' };
import event1quoteRepost from '~/fixtures/events/event-1-quote-repost.json' with { type: 'json' };
import event1willBeQuoteReposted from '~/fixtures/events/event-1-that-will-be-quote-reposted.json' with {
  type: 'json',
};
import event1reposted from '~/fixtures/events/event-1-reposted.json' with { type: 'json' };
import event6 from '~/fixtures/events/event-6.json' with { type: 'json' };
import { DittoEvent } from '@/interfaces/DittoEvent.ts';

Deno.test('hydrate author', async () => {
  const db = new NCache({ max: 100 });

  const event0copy = structuredClone(event0);
  const event1copy = structuredClone(event1);

  // Save events to database
  await db.event(event0copy);
  await db.event(event1copy);

  assertEquals((event1 as DittoEvent).author, undefined, "Event hasn't been hydrated yet");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1000);

  await hydrateEvents({
    events: [event1],
    relations: ['author'],
    storage: db,
    signal: controller.signal,
  });

  const expectedEvent = { ...event1, author: event0 };
  assertEquals(event1, expectedEvent);

  await db.remove([{ kinds: [0, 1] }]);
  assertEquals(await db.query([{ kinds: [0, 1] }]), []);

  clearTimeout(timeoutId);
});

Deno.test('hydrate repost', async () => {
  const db = new NCache({ max: 100 });

  const event0madePostCopy = structuredClone(event0madePost);
  const event0madeRepostCopy = structuredClone(event0madeRepost);
  const event1repostedCopy = structuredClone(event1reposted);
  const event6copy = structuredClone(event6);

  // Save events to database
  await db.event(event0madePostCopy);
  await db.event(event0madeRepostCopy);
  await db.event(event1repostedCopy);
  await db.event(event6copy);

  assertEquals((event6 as DittoEvent).author, undefined, "Event hasn't been hydrated author yet");
  assertEquals((event6 as DittoEvent).repost, undefined, "Event hasn't been hydrated repost yet");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1000);

  await hydrateEvents({
    events: [event6],
    relations: ['repost', 'author'],
    storage: db,
    signal: controller.signal,
  });

  const expectedEvent6 = { ...event6, author: event0madeRepost, repost: { ...event1reposted, author: event0madePost } };
  assertEquals(event6, expectedEvent6);

  await db.remove([{ kinds: [0, 1, 6] }]);
  assertEquals(await db.query([{ kinds: [0, 1, 6] }]), []);

  clearTimeout(timeoutId);
});

Deno.test('hydrate quote repost with hydrate author', async () => {
  const db = new NCache({ max: 100 });

  const event0madeQuoteRepostCopy = structuredClone(event0madeQuoteRepost);
  const event0copy = structuredClone(event0);
  const event1quoteRepostCopy = structuredClone(event1quoteRepost);
  const event1willBeQuoteRepostedCopy = structuredClone(event1willBeQuoteReposted);

  // Save events to database
  await db.event(event0madeQuoteRepostCopy);
  await db.event(event0copy);
  await db.event(event1quoteRepostCopy);
  await db.event(event1willBeQuoteRepostedCopy);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1000);

  await hydrateEvents({
    events: [event1quoteRepost],
    relations: ['author', 'quote_repost'], // if author is called first the performance will be better
    storage: db,
    signal: controller.signal,
  });

  const expectedEvent1quoteRepost = {
    ...event1quoteRepost,
    author: event0madeQuoteRepost,
    quote_repost: { ...event1willBeQuoteReposted, author: event0 },
  };

  assertEquals(event1quoteRepost, expectedEvent1quoteRepost);

  await db.remove([{ kinds: [0, 1] }]);
  assertEquals(await db.query([{ kinds: [0, 1] }]), []);

  clearTimeout(timeoutId);
});

Deno.test('hydrate quote repost WITHOUT hydrate author', async () => {
  const db = new NCache({ max: 100 });

  const event0madeQuoteRepostCopy = structuredClone(event0madeQuoteRepost);
  const event0copy = structuredClone(event0);
  const event1quoteRepostCopy = structuredClone(event1quoteRepost);
  const event1willBeQuoteRepostedCopy = structuredClone(event1willBeQuoteReposted);

  // Save events to database
  await db.event(event0madeQuoteRepostCopy);
  await db.event(event0copy);
  await db.event(event1quoteRepostCopy);
  await db.event(event1willBeQuoteRepostedCopy);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1000);

  await hydrateEvents({
    events: [event1quoteRepost, event1willBeQuoteReposted],
    relations: ['quote_repost'],
    storage: db,
    signal: controller.signal,
  });

  const expectedEvent1quoteRepost = {
    ...event1quoteRepost,
    quote_repost: { ...event1willBeQuoteReposted, author: event0 },
  };

  assertEquals(event1quoteRepost, expectedEvent1quoteRepost);

  await db.remove([{ kinds: [0, 1] }]);
  assertEquals(await db.query([{ kinds: [0, 1] }]), []);

  clearTimeout(timeoutId);
});
