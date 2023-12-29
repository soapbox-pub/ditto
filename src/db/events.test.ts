import { assertEquals } from '@/deps-test.ts';
import { insertUser } from '@/db/users.ts';

import event1 from '~/fixtures/events/event-1.json' assert { type: 'json' };

import { eventsDB as db } from './events.ts';

Deno.test('count filters', async () => {
  assertEquals(await db.countEvents([{ kinds: [1] }]), 0);
  await db.storeEvent(event1);
  assertEquals(await db.countEvents([{ kinds: [1] }]), 1);
});

Deno.test('insert and filter events', async () => {
  await db.storeEvent(event1);

  assertEquals(await db.getEvents([{ kinds: [1] }]), [event1]);
  assertEquals(await db.getEvents([{ kinds: [3] }]), []);
  assertEquals(await db.getEvents([{ since: 1691091000 }]), [event1]);
  assertEquals(await db.getEvents([{ until: 1691091000 }]), []);
  assertEquals(
    await db.getEvents([{ '#proxy': ['https://gleasonator.com/objects/8f6fac53-4f66-4c6e-ac7d-92e5e78c3e79'] }]),
    [event1],
  );
});

Deno.test('delete events', async () => {
  await db.storeEvent(event1);
  assertEquals(await db.getEvents([{ kinds: [1] }]), [event1]);
  await db.deleteEvents([{ kinds: [1] }]);
  assertEquals(await db.getEvents([{ kinds: [1] }]), []);
});

Deno.test('query events with local filter', async () => {
  await db.storeEvent(event1);

  assertEquals(await db.getEvents([{}]), [event1]);
  assertEquals(await db.getEvents([{ local: true }]), []);
  assertEquals(await db.getEvents([{ local: false }]), [event1]);

  await insertUser({
    username: 'alex',
    pubkey: event1.pubkey,
    inserted_at: new Date(),
    admin: 0,
  });

  assertEquals(await db.getEvents([{ local: true }]), [event1]);
  assertEquals(await db.getEvents([{ local: false }]), []);
});
