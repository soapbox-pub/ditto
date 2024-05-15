import { assertEquals, assertRejects } from '@std/assert';

import { DittoDB } from '@/db/DittoDB.ts';

import event0 from '~/fixtures/events/event-0.json' with { type: 'json' };
import event1 from '~/fixtures/events/event-1.json' with { type: 'json' };

import { EventsDB } from '@/storages/events-db.ts';

const kysely = await DittoDB.getInstance();
const eventsDB = new EventsDB(kysely);

Deno.test('count filters', async () => {
  assertEquals((await eventsDB.count([{ kinds: [1] }])).count, 0);
  await eventsDB.event(event1);
  assertEquals((await eventsDB.count([{ kinds: [1] }])).count, 1);
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

Deno.test('query events with domain search filter', async () => {
  await eventsDB.event(event1);

  assertEquals(await eventsDB.query([{}]), [event1]);
  assertEquals(await eventsDB.query([{ search: 'domain:localhost:8000' }]), []);
  assertEquals(await eventsDB.query([{ search: '' }]), [event1]);

  await kysely
    .insertInto('pubkey_domains')
    .values({ pubkey: event1.pubkey, domain: 'localhost:8000', last_updated_at: event1.created_at })
    .execute();

  assertEquals(await eventsDB.query([{ kinds: [1], search: 'domain:localhost:8000' }]), [event1]);
  assertEquals(await eventsDB.query([{ kinds: [1], search: 'domain:example.com' }]), []);
});

Deno.test('delete events', async () => {
  await eventsDB.event(event1);
  assertEquals(await eventsDB.query([{ kinds: [1] }]), [event1]);
  await eventsDB.remove([{ kinds: [1] }]);
  assertEquals(await eventsDB.query([{ kinds: [1] }]), []);
});

Deno.test('inserting replaceable events', async () => {
  assertEquals((await eventsDB.count([{ kinds: [0], authors: [event0.pubkey] }])).count, 0);

  await eventsDB.event(event0);
  await assertRejects(() => eventsDB.event(event0));
  assertEquals((await eventsDB.count([{ kinds: [0], authors: [event0.pubkey] }])).count, 1);

  const changeEvent = { ...event0, id: '123', created_at: event0.created_at + 1 };
  await eventsDB.event(changeEvent);
  assertEquals(await eventsDB.query([{ kinds: [0] }]), [changeEvent]);
});
