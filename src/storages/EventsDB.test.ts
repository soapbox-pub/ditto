import { assertEquals, assertRejects } from '@std/assert';
import { generateSecretKey } from 'nostr-tools';

import { RelayError } from '@/RelayError.ts';
import { eventFixture, genEvent } from '@/test.ts';
import { Conf } from '@/config.ts';
import { createTestDB } from '@/test.ts';

Deno.test('count filters', async () => {
  await using db = await createTestDB();
  const { store } = db;

  const event1 = await eventFixture('event-1');

  assertEquals((await store.count([{ kinds: [1] }])).count, 0);
  await store.event(event1);
  assertEquals((await store.count([{ kinds: [1] }])).count, 1);
});

Deno.test('insert and filter events', async () => {
  await using db = await createTestDB();
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
  await using db = await createTestDB();
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

Deno.test('delete events', async () => {
  await using db = await createTestDB();
  const { store } = db;

  const [one, two] = [
    { id: '1', kind: 1, pubkey: 'abc', content: 'hello world', created_at: 1, sig: '', tags: [] },
    { id: '2', kind: 1, pubkey: 'abc', content: 'yolo fam', created_at: 2, sig: '', tags: [] },
  ];

  await store.event(one);
  await store.event(two);

  // Sanity check
  assertEquals(await store.query([{ kinds: [1] }]), [two, one]);

  await store.event({
    kind: 5,
    pubkey: one.pubkey,
    tags: [['e', one.id]],
    created_at: 0,
    content: '',
    id: '',
    sig: '',
  });

  assertEquals(await store.query([{ kinds: [1] }]), [two]);
});

Deno.test("user cannot delete another user's event", async () => {
  await using db = await createTestDB();
  const { store } = db;

  const event = { id: '1', kind: 1, pubkey: 'abc', content: 'hello world', created_at: 1, sig: '', tags: [] };
  await store.event(event);

  // Sanity check
  assertEquals(await store.query([{ kinds: [1] }]), [event]);

  await store.event({
    kind: 5,
    pubkey: 'def', // different pubkey
    tags: [['e', event.id]],
    created_at: 0,
    content: '',
    id: '',
    sig: '',
  });

  assertEquals(await store.query([{ kinds: [1] }]), [event]);
});

Deno.test('admin can delete any event', async () => {
  await using db = await createTestDB();
  const { store } = db;

  const [one, two] = [
    { id: '1', kind: 1, pubkey: 'abc', content: 'hello world', created_at: 1, sig: '', tags: [] },
    { id: '2', kind: 1, pubkey: 'abc', content: 'yolo fam', created_at: 2, sig: '', tags: [] },
  ];

  await store.event(one);
  await store.event(two);

  // Sanity check
  assertEquals(await store.query([{ kinds: [1] }]), [two, one]);

  await store.event({
    kind: 5,
    pubkey: Conf.pubkey, // Admin pubkey
    tags: [['e', one.id]],
    created_at: 0,
    content: '',
    id: '',
    sig: '',
  });

  assertEquals(await store.query([{ kinds: [1] }]), [two]);
});

Deno.test('throws a RelayError when inserting an event deleted by the admin', async () => {
  await using db = await createTestDB();
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
  await using db = await createTestDB();
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
  await using db = await createTestDB();
  const { store } = db;

  const event = await eventFixture('event-0');
  await store.event(event);

  const olderEvent = { ...event, id: '123', created_at: event.created_at - 1 };
  await store.event(olderEvent);
  assertEquals(await store.query([{ kinds: [0], authors: [event.pubkey] }]), [event]);

  const newerEvent = { ...event, id: '123', created_at: event.created_at + 1 };
  await store.event(newerEvent);
  assertEquals(await store.query([{ kinds: [0] }]), [newerEvent]);
});

Deno.test("throws a RelayError when querying an event with a large 'since'", async () => {
  await using db = await createTestDB();
  const { store } = db;

  await assertRejects(
    () => store.query([{ since: 33333333333333 }]),
    RelayError,
    'since filter too far into the future',
  );
});

Deno.test("throws a RelayError when querying an event with a large 'until'", async () => {
  await using db = await createTestDB();
  const { store } = db;

  await assertRejects(
    () => store.query([{ until: 66666666666666 }]),
    RelayError,
    'until filter too far into the future',
  );
});

Deno.test("throws a RelayError when querying an event with a large 'kind'", async () => {
  await using db = await createTestDB();
  const { store } = db;

  await assertRejects(
    () => store.query([{ kinds: [99999999999999] }]),
    RelayError,
    'kind filter too far into the future',
  );
});

Deno.test(
  'query user by NIP-05 search filter',
  { ignore: Conf.db.dialect !== 'postgres' },
  async () => {
    await using db = await createTestDB();
    const { store } = db;

    const event0 = await eventFixture('event-0');
    await store.event(event0);

    assertEquals(await store.query([{}]), [event0]);
    assertEquals(await store.query([{ search: 'sonator.dev' }]), []);
    assertEquals(await store.query([{ search: 'alex' }]), [event0]);
    assertEquals(await store.query([{ search: 'gleasonator' }]), [event0]);
    assertEquals(await store.query([{ search: 'com' }]), [event0]);
    assertEquals(await store.query([{ search: 'mostr' }]), [event0]);
    assertEquals(await store.query([{ search: 'pub' }]), [event0]);
    assertEquals(await store.query([{ search: 'mostr.pub' }]), [event0]);
  },
);
