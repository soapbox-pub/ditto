import { assertEquals } from '@/deps-test.ts';
import { EventsDB } from '@/storages/events-db.ts';
import { db } from '@/db.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';

import event0 from '~/fixtures/events/event-0.json' with { type: 'json' };
import event0madePost from '~/fixtures/events/event-0-the-one-who-post-and-users-repost.json' with { type: 'json' };
import event0madeRepost from '~/fixtures/events/event-0-the-one-who-repost.json' with { type: 'json' };
import event1 from '~/fixtures/events/event-1.json' with { type: 'json' };
import event1reposted from '~/fixtures/events/event-1-reposted.json' with { type: 'json' };
import event6 from '~/fixtures/events/event-6.json' with { type: 'json' };
import { DittoEvent } from '@/interfaces/DittoEvent.ts';

const eventsDB = new EventsDB(db);

Deno.test('hydrate author', async () => {
  // Save events to database
  await eventsDB.event(event0);
  await eventsDB.event(event1);

  assertEquals((event1 as DittoEvent).author, undefined, "Event hasn't been hydrated yet");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1000);

  await hydrateEvents({
    events: [event1],
    relations: ['author'],
    storage: eventsDB,
    signal: controller.signal,
  });

  const expectedEvent = { ...event1, author: event0 };
  assertEquals(event1, expectedEvent);

  await eventsDB.remove([{ kinds: [0, 1] }]);
  assertEquals(await eventsDB.query([{ kinds: [0, 1] }]), []);

  clearTimeout(timeoutId);
});

Deno.test('hydrate repost', async () => {
  // Save events to database
  await eventsDB.event(event0madePost);
  await eventsDB.event(event0madeRepost);
  await eventsDB.event(event1reposted);
  await eventsDB.event(event6);

  assertEquals((event6 as DittoEvent).author, undefined, "Event hasn't been hydrated author yet");
  assertEquals((event6 as DittoEvent).repost, undefined, "Event hasn't been hydrated repost yet");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1000);

  await hydrateEvents({
    events: [event6],
    relations: ['repost', 'author'],
    storage: eventsDB,
    signal: controller.signal,
  });

  const expectedEvent6 = { ...event6, author: event0madeRepost, repost: { ...event1reposted, author: event0madePost } };
  assertEquals(event6, expectedEvent6);

  await eventsDB.remove([{ kinds: [0, 1, 6] }]);
  assertEquals(await eventsDB.query([{ kinds: [0, 1, 6] }]), []);

  clearTimeout(timeoutId);
});
