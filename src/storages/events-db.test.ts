import { db } from '@/db.ts';
import { buildUserEvent } from '@/db/users.ts';
import { assertEquals, assertRejects } from '@/deps-test.ts';

import event0 from '~/fixtures/events/event-0.json' with { type: 'json' };
import event1 from '~/fixtures/events/event-1.json' with { type: 'json' };

import { EventsDB } from './events-db.ts';

const eventsDB = new EventsDB(db);

Deno.test('count filters', async () => {
  assertEquals(await eventsDB.count([{ kinds: [1] }]), 0);
  await eventsDB.event(event1);
  assertEquals(await eventsDB.count([{ kinds: [1] }]), 1);
});

Deno.test('insert and filter events', async () => {
  await eventsDB.event(event1);

  assertEquals(await eventsDB.query([{ kinds: [1] }]), [event1]);
  assertEquals(await eventsDB.query([{ kinds: [3] }]), []);
  assertEquals(await eventsDB.query([{ since: 1691091000 }]), [event1]);
  assertEquals(await eventsDB.query([{ until: 1691091000 }]), []);
  assertEquals(
    await eventsDB.query([{ '#proxy': ['https://gleasonator.com/objects/8f6fac53-4f66-4c6e-ac7d-92e5e78c3e79'] }]),
    [event1],
  );
});

Deno.test('delete events', async () => {
  await eventsDB.event(event1);
  assertEquals(await eventsDB.query([{ kinds: [1] }]), [event1]);
  await eventsDB.remove([{ kinds: [1] }]);
  assertEquals(await eventsDB.query([{ kinds: [1] }]), []);
});

Deno.test('query events with local filter', async () => {
  await eventsDB.event(event1);

  assertEquals(await eventsDB.query([{}]), [event1]);
  assertEquals(await eventsDB.query([{ local: true }]), []);
  assertEquals(await eventsDB.query([{ local: false }]), [event1]);

  const userEvent = await buildUserEvent({
    username: 'alex',
    pubkey: event1.pubkey,
    inserted_at: new Date(),
    admin: false,
  });
  await eventsDB.event(userEvent);

  assertEquals(await eventsDB.query([{ kinds: [1], local: true }]), [event1]);
  assertEquals(await eventsDB.query([{ kinds: [1], local: false }]), []);
});

Deno.test('inserting replaceable events', async () => {
  assertEquals(await eventsDB.count([{ kinds: [0], authors: [event0.pubkey] }]), 0);

  await eventsDB.event(event0);
  await assertRejects(() => eventsDB.event(event0));
  assertEquals(await eventsDB.count([{ kinds: [0], authors: [event0.pubkey] }]), 1);

  const changeEvent = { ...event0, id: '123', created_at: event0.created_at + 1 };
  await eventsDB.event(changeEvent);
  assertEquals(await eventsDB.query([{ kinds: [0] }]), [changeEvent]);
});
