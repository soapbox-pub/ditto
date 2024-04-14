import { assertEquals } from '@/deps-test.ts';
import { EventsDB } from '@/storages/events-db.ts';
import { db } from '@/db.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';

import event0 from '~/fixtures/events/event-0.json' with { type: 'json' };
import event1 from '~/fixtures/events/event-1.json' with { type: 'json' };

const eventsDB = new EventsDB(db);

Deno.test('hydrate author', async () => {
  // Save events to database
  await eventsDB.event(event1);
  await eventsDB.event(event0);

  assertEquals((event1 as any).author, undefined, "Event hasn't been hydrated yet");

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

  clearTimeout(timeoutId);
});
