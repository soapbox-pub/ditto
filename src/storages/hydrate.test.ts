import { assertEquals } from '@/deps-test.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { MockRelay } from '@nostrify/nostrify/test';

import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { eventFixture } from '@/test.ts';

import event0madePost from '~/fixtures/events/event-0-the-one-who-post-and-users-repost.json' with { type: 'json' };
import event0madeRepost from '~/fixtures/events/event-0-the-one-who-repost.json' with { type: 'json' };
import event0madeQuoteRepost from '~/fixtures/events/event-0-the-one-who-quote-repost.json' with { type: 'json' };
import event1 from '~/fixtures/events/event-1.json' with { type: 'json' };
import event1quoteRepost from '~/fixtures/events/event-1-quote-repost.json' with { type: 'json' };
import event1futureIsMine from '~/fixtures/events/event-1-will-be-reposted-with-quote-repost.json' with {
  type: 'json',
};
import event1quoteRepostLatin from '~/fixtures/events/event-1-quote-repost-will-be-reposted.json' with { type: 'json' };
import event1willBeQuoteReposted from '~/fixtures/events/event-1-that-will-be-quote-reposted.json' with {
  type: 'json',
};
import event1reposted from '~/fixtures/events/event-1-reposted.json' with { type: 'json' };
import event6 from '~/fixtures/events/event-6.json' with { type: 'json' };
import event6ofQuoteRepost from '~/fixtures/events/event-6-of-quote-repost.json' with { type: 'json' };

Deno.test('hydrateEvents(): author --- WITHOUT stats', async () => {
  const db = new MockRelay();

  const event0 = await eventFixture('event-0');
  const event1copy = structuredClone(event1);

  // Save events to database
  await db.event(event0);
  await db.event(event1copy);

  assertEquals((event1copy as DittoEvent).author, undefined, "Event hasn't been hydrated yet");

  await hydrateEvents({
    events: [event1copy],
    storage: db,
  });

  const expectedEvent = { ...event1copy, author: event0 };
  assertEquals(event1copy, expectedEvent);
});

Deno.test('hydrateEvents(): repost --- WITHOUT stats', async () => {
  const db = new MockRelay();

  const event0madePostCopy = structuredClone(event0madePost);
  const event0madeRepostCopy = structuredClone(event0madeRepost);
  const event1repostedCopy = structuredClone(event1reposted);
  const event6copy = structuredClone(event6);

  // Save events to database
  await db.event(event0madePostCopy);
  await db.event(event0madeRepostCopy);
  await db.event(event1repostedCopy);
  await db.event(event6copy);

  assertEquals((event6copy as DittoEvent).author, undefined, "Event hasn't hydrated author yet");
  assertEquals((event6copy as DittoEvent).repost, undefined, "Event hasn't hydrated repost yet");

  await hydrateEvents({
    events: [event6copy],
    storage: db,
  });

  const expectedEvent6 = {
    ...event6copy,
    author: event0madeRepostCopy,
    repost: { ...event1repostedCopy, author: event0madePostCopy },
  };
  assertEquals(event6copy, expectedEvent6);
});

Deno.test('hydrateEvents(): quote repost --- WITHOUT stats', async () => {
  const db = new MockRelay();

  const event0madeQuoteRepostCopy = structuredClone(event0madeQuoteRepost);
  const event0 = await eventFixture('event-0');
  const event1quoteRepostCopy = structuredClone(event1quoteRepost);
  const event1willBeQuoteRepostedCopy = structuredClone(event1willBeQuoteReposted);

  // Save events to database
  await db.event(event0madeQuoteRepostCopy);
  await db.event(event0);
  await db.event(event1quoteRepostCopy);
  await db.event(event1willBeQuoteRepostedCopy);

  await hydrateEvents({
    events: [event1quoteRepostCopy],
    storage: db,
  });

  const expectedEvent1quoteRepost = {
    ...event1quoteRepostCopy,
    author: event0madeQuoteRepostCopy,
    quote: { ...event1willBeQuoteRepostedCopy, author: event0 },
  };

  assertEquals(event1quoteRepostCopy, expectedEvent1quoteRepost);
});

Deno.test('hydrateEvents(): repost of quote repost --- WITHOUT stats', async () => {
  const db = new MockRelay();

  const author = await eventFixture('event-0-makes-repost-with-quote-repost');
  const event1copy = structuredClone(event1futureIsMine);
  const event1quoteCopy = structuredClone(event1quoteRepostLatin);
  const event6copy = structuredClone(event6ofQuoteRepost);

  // Save events to database
  await db.event(author);
  await db.event(event1copy);
  await db.event(event1quoteCopy);
  await db.event(event6copy);

  assertEquals((event6copy as DittoEvent).author, undefined, "Event hasn't hydrated author yet");
  assertEquals((event6copy as DittoEvent).repost, undefined, "Event hasn't hydrated repost yet");

  await hydrateEvents({
    events: [event6copy],
    storage: db,
  });

  const expectedEvent6 = {
    ...event6copy,
    author,
    repost: { ...event1quoteCopy, author, quote: { author, ...event1copy } },
  };
  assertEquals(event6copy, expectedEvent6);
});
