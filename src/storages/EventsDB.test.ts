import { assertEquals, assertRejects } from '@std/assert';
import { generateSecretKey } from 'nostr-tools';

import { RelayError } from '@/RelayError.ts';
import { eventFixture, genEvent } from '@/test.ts';
import { Conf } from '@/config.ts';
import { createTestDB } from '@/test.ts';

Deno.test('count filters', async () => {
  await using db = await createTestDB({ pure: true });
  const { store } = db;

  const event1 = await eventFixture('event-1');

  assertEquals((await store.count([{ kinds: [1] }])).count, 0);
  await store.event(event1);
  assertEquals((await store.count([{ kinds: [1] }])).count, 1);
});

Deno.test('insert and filter events', async () => {
  await using db = await createTestDB({ pure: true });
  const { store } = db;

  const event1 = await eventFixture('event-1');
  await store.event(event1);

  assertEquals(await store.query([{ kinds: [1] }]), [event1]);
  assertEquals(await store.query([{ kinds: [3] }]), []);
  assertEquals(await store.query([{ since: 1691091000 }]), [event1]);
  assertEquals(await store.query([{ until: 1691091000 }]), []);
  assertEquals(
    await store.query([{ '#proxy': ['https://gleasonator.com/objects/8f6fac53-4f66-4c6e-ac7d-92e5e78c3e79'] }]),
    [event1],
  );
});

Deno.test('query events with domain search filter', async () => {
  await using db = await createTestDB({ pure: true });
  const { store, kysely } = db;

  const event1 = await eventFixture('event-1');
  await store.event(event1);

  assertEquals(await store.query([{}]), [event1]);
  assertEquals(await store.query([{ search: 'domain:localhost:4036' }]), []);
  assertEquals(await store.query([{ search: '' }]), [event1]);

  await kysely
    .insertInto('pubkey_domains')
    .values({ pubkey: event1.pubkey, domain: 'localhost:4036', last_updated_at: event1.created_at })
    .execute();

  assertEquals(await store.query([{ kinds: [1], search: 'domain:localhost:4036' }]), [event1]);
  assertEquals(await store.query([{ kinds: [1], search: 'domain:example.com' }]), []);
});

Deno.test('query events with language search filter', async () => {
  await using db = await createTestDB({ pure: true });
  const { store, kysely } = db;

  const en = genEvent({ kind: 1, content: 'hello world!' });
  const es = genEvent({ kind: 1, content: 'hola mundo!' });

  await store.event(en);
  await store.event(es);

  await kysely.updateTable('nostr_events').set('language', 'en').where('id', '=', en.id).execute();
  await kysely.updateTable('nostr_events').set('language', 'es').where('id', '=', es.id).execute();

  assertEquals(await store.query([{ search: 'language:en' }]), [en]);
  assertEquals(await store.query([{ search: 'language:es' }]), [es]);
});

Deno.test('delete events', async () => {
  await using db = await createTestDB({ pure: true });
  const { store } = db;

  const sk = generateSecretKey();

  const [one, two] = [
    genEvent({ kind: 1, content: 'hello world', created_at: 1 }, sk),
    genEvent({ kind: 1, content: 'yolo fam', created_at: 2 }, sk),
  ];

  await store.event(one);
  await store.event(two);

  // Sanity check
  assertEquals(await store.query([{ kinds: [1] }]), [two, one]);

  await store.event(
    genEvent({ kind: 5, tags: [['e', one.id]] }, sk),
  );

  assertEquals(await store.query([{ kinds: [1] }]), [two]);
});

Deno.test("user cannot delete another user's event", async () => {
  await using db = await createTestDB({ pure: true });
  const { store } = db;

  const event = genEvent({ kind: 1, content: 'hello world', created_at: 1 });
  await store.event(event);

  // Sanity check
  assertEquals(await store.query([{ kinds: [1] }]), [event]);

  await store.event(
    genEvent({ kind: 5, tags: [['e', event.id]] }), // different sk
  );

  assertEquals(await store.query([{ kinds: [1] }]), [event]);
});

Deno.test('admin can delete any event', async () => {
  await using db = await createTestDB({ pure: true });
  const { store } = db;

  const sk = generateSecretKey();

  const [one, two] = [
    genEvent({ kind: 1, content: 'hello world', created_at: 1 }, sk),
    genEvent({ kind: 1, content: 'yolo fam', created_at: 2 }, sk),
  ];

  await store.event(one);
  await store.event(two);

  // Sanity check
  assertEquals(await store.query([{ kinds: [1] }]), [two, one]);

  await store.event(
    genEvent({ kind: 5, tags: [['e', one.id]] }, Conf.seckey), // admin sk
  );

  assertEquals(await store.query([{ kinds: [1] }]), [two]);
});

Deno.test('throws a RelayError when inserting an event deleted by the admin', async () => {
  await using db = await createTestDB({ pure: true });
  const { store } = db;

  const event = genEvent();
  await store.event(event);

  const deletion = genEvent({ kind: 5, tags: [['e', event.id]] }, Conf.seckey);
  await store.event(deletion);

  await assertRejects(
    () => store.event(event),
    RelayError,
    'event deleted by admin',
  );
});

Deno.test('throws a RelayError when inserting an event deleted by a user', async () => {
  await using db = await createTestDB({ pure: true });
  const { store } = db;

  const sk = generateSecretKey();

  const event = genEvent({}, sk);
  await store.event(event);

  const deletion = genEvent({ kind: 5, tags: [['e', event.id]] }, sk);
  await store.event(deletion);

  await assertRejects(
    () => store.event(event),
    RelayError,
    'event deleted by user',
  );
});

Deno.test('inserting replaceable events', async () => {
  await using db = await createTestDB({ pure: true });
  const { store } = db;

  const sk = generateSecretKey();
  const event = genEvent({ kind: 0, created_at: 100 }, sk);
  await store.event(event);

  const olderEvent = genEvent({ kind: 0, created_at: 50 }, sk);
  await store.event(olderEvent);
  assertEquals(await store.query([{ kinds: [0], authors: [event.pubkey] }]), [event]);

  const newerEvent = genEvent({ kind: 0, created_at: 999 }, sk);
  await store.event(newerEvent);
  assertEquals(await store.query([{ kinds: [0] }]), [newerEvent]);
});

Deno.test("throws a RelayError when querying an event with a large 'since'", async () => {
  await using db = await createTestDB({ pure: true });
  const { store } = db;

  await assertRejects(
    () => store.query([{ since: 33333333333333 }]),
    RelayError,
    'since filter too far into the future',
  );
});

Deno.test("throws a RelayError when querying an event with a large 'until'", async () => {
  await using db = await createTestDB({ pure: true });
  const { store } = db;

  await assertRejects(
    () => store.query([{ until: 66666666666666 }]),
    RelayError,
    'until filter too far into the future',
  );
});

Deno.test("throws a RelayError when querying an event with a large 'kind'", async () => {
  await using db = await createTestDB({ pure: true });
  const { store } = db;

  await assertRejects(
    () => store.query([{ kinds: [99999999999999] }]),
    RelayError,
    'kind filter too far into the future',
  );
});

Deno.test('NPostgres.query with search', async (t) => {
  await using db = await createTestDB({ pure: true });
  const { store } = db;

  const eventA = genEvent({ kind: 1, content: 'Fediverse is vegan' });
  const eventB = genEvent({ kind: 1, content: 'Im vegan btw' });

  await store.event(eventA);
  await store.event(eventB);

  await t.step('match single event', async () => {
    assertEquals(await store.query([{ search: 'Fediverse' }]), [eventA]);
  });

  await t.step('match multiple events', async () => {
    assertEquals(await store.query([{ search: 'vegan' }]), [eventA, eventB]);
  });

  await t.step("don't match nonsense queries", async () => {
    assertEquals(await store.query([{ search: "this shouldn't match" }]), []);
  });
});
