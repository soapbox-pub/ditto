import { assertEquals, assertRejects } from '@std/assert';
import { NostrRelayMsg } from '@nostrify/nostrify';
import { genEvent } from '@nostrify/nostrify/test';
import { generateSecretKey } from 'nostr-tools';

import { RelayError } from '@/RelayError.ts';
import { eventFixture } from '@/test.ts';
import { DittoPgStore } from '@/storages/DittoPgStore.ts';
import { createTestDB } from '@/test.ts';

Deno.test('req streaming', async () => {
  await using db = await createTestDB({ pure: true });
  const { store: relay } = db;

  const msgs: NostrRelayMsg[] = [];
  const controller = new AbortController();

  const promise = (async () => {
    for await (const msg of relay.req([{ limit: 0 }], { signal: controller.signal })) {
      msgs.push(msg);
    }
  })();

  const event = genEvent({ created_at: Math.floor(Date.now() / 1000) });
  await relay.event(event);

  controller.abort();

  await promise;

  const verbs = msgs.map(([verb]) => verb);

  assertEquals(verbs, ['EOSE', 'EVENT', 'CLOSED']);
  assertEquals(msgs[1][2], event);
  assertEquals(relay.subs.size, 0); // cleanup
});

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
  assertEquals(await store.query([{ search: 'domain:gleasonator.dev' }]), []);
  assertEquals(await store.query([{ search: '' }]), [event1]);

  await kysely
    .updateTable('author_stats')
    .set({
      pubkey: event1.pubkey,
      nip05_domain: 'gleasonator.dev',
      nip05_last_verified_at: event1.created_at,
      followers_count: 0,
      following_count: 0,
      notes_count: 0,
      search: '',
    })
    .execute();

  assertEquals(await store.query([{ kinds: [1], search: 'domain:gleasonator.dev' }]), [event1]);
  assertEquals(await store.query([{ kinds: [1], search: 'domain:example.com' }]), []);
});

Deno.test('query events with language search filter', async () => {
  await using db = await createTestDB({ pure: true });
  const { store, kysely } = db;

  const en = genEvent({ kind: 1, content: 'hello world!' });
  const es = genEvent({ kind: 1, content: 'hola mundo!' });

  await store.event(en);
  await store.event(es);

  await kysely.updateTable('nostr_events').set('search_ext', { language: 'en' }).where('id', '=', en.id).execute();
  await kysely.updateTable('nostr_events').set('search_ext', { language: 'es' }).where('id', '=', es.id).execute();

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
  const { conf, store } = db;

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
    genEvent({ kind: 5, tags: [['e', one.id]] }, conf.seckey), // admin sk
  );

  assertEquals(await store.query([{ kinds: [1] }]), [two]);
});

Deno.test('throws a RelayError when inserting an event deleted by the admin', async () => {
  await using db = await createTestDB({ pure: true });
  const { conf, store } = db;

  const event = genEvent();
  await store.event(event);

  const deletion = genEvent({ kind: 5, tags: [['e', event.id]] }, conf.seckey);
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
    // RelayError,
    'event deleted by user',
  );
});

Deno.test('inserting the same event twice', async () => {
  await using db = await createTestDB({ pure: true });
  const { store } = db;

  const event = genEvent({ kind: 1 });

  await store.event(event);
  await store.event(event);
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

  await store.event(olderEvent); // doesn't throw
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

  const eventA = genEvent({ kind: 1, content: 'Fediverse is vegan', created_at: 0 });
  const eventB = genEvent({ kind: 1, content: 'Im vegan btw', created_at: 1 });

  await store.event(eventA);
  await store.event(eventB);

  await t.step('match single event', async () => {
    assertEquals(await store.query([{ search: 'Fediverse' }]), [eventA]);
  });

  await t.step('match multiple events', async () => {
    assertEquals(await store.query([{ search: 'vegan' }]), [eventB, eventA]);
  });

  await t.step("don't match nonsense queries", async () => {
    assertEquals(await store.query([{ search: "this shouldn't match" }]), []);
  });
});

Deno.test('DittoPgStore.indexTags indexes only the final `e` and `p` tag of kind 7 events', () => {
  const event = {
    kind: 7,
    id: 'a92549a442d306b32273aa9456ba48e3851a4e6203af3f567543298ab964b35b',
    pubkey: 'f288a224a61b7361aa9dc41a90aba8a2dff4544db0bc386728e638b21da1792c',
    created_at: 1737908284,
    tags: [
      ['e', '2503cea56931fb25914866e12ffc739741539db4d6815220b9974ef0967fe3f9', '', 'root'],
      ['p', 'fad5c18326fb26d9019f1b2aa503802f0253494701bf311d7588a1e65cb8046b'],
      ['p', '26d6a946675e603f8de4bf6f9cef442037b70c7eee170ff06ed7673fc34c98f1'],
      ['p', '04c960497af618ae18f5147b3e5c309ef3d8a6251768a1c0820e02c93768cc3b'],
      ['p', '0114bb11dd8eb89bfb40669509b2a5a473d27126e27acae58257f2fd7cd95776'],
      ['p', '9fce3aea32b35637838fb45b75be32595742e16bb3e4742cc82bb3d50f9087e6'],
      ['p', '26bd32c67232bdf16d05e763ec67d883015eb99fd1269025224c20c6cfdb0158'],
      ['p', 'eab0e756d32b80bcd464f3d844b8040303075a13eabc3599a762c9ac7ab91f4f'],
      ['p', 'edcd20558f17d99327d841e4582f9b006331ac4010806efa020ef0d40078e6da'],
      ['p', 'bd1e19980e2c91e6dc657e92c25762ca882eb9272d2579e221f037f93788de91'],
      ['p', 'bf2376e17ba4ec269d10fcc996a4746b451152be9031fa48e74553dde5526bce'],
      ['p', '3878d95db7b854c3a0d3b2d6b7bf9bf28b36162be64326f5521ba71cf3b45a69'],
      ['p', 'ede3866ddfc40aa4e458952c11c67e827e3cbb8a6a4f0a934c009aa2ed2fb477'],
      ['p', 'f288a224a61b7361aa9dc41a90aba8a2dff4544db0bc386728e638b21da1792c'],
      ['p', '9ce71f1506ccf4b99f234af49bd6202be883a80f95a155c6e9a1c36fd7e780c7', '', 'mention'],
      ['p', '932614571afcbad4d17a191ee281e39eebbb41b93fac8fd87829622aeb112f4d', '', 'mention'],
      ['e', 'e3653ae41ffb510e5fc071555ecfbc94d2fc31e355d61d941e39a97ac6acb15b'],
      ['p', '4e088f3087f6a7e7097ce5fe7fd884ec04ddc69ed6cdd37c55e200f7744b1792'],
    ],
    content: '🤙',
    sig:
      '44639d039a7f7fb8772fcfa13d134d3cda684ec34b6a777ead589676f9e8d81b08a24234066dcde1aacfbe193224940fba7586e7197c159757d3caf8f2b57e1b',
  };

  const tags = DittoPgStore.indexTags(event);

  assertEquals(tags, [
    ['e', 'e3653ae41ffb510e5fc071555ecfbc94d2fc31e355d61d941e39a97ac6acb15b'],
    ['p', '4e088f3087f6a7e7097ce5fe7fd884ec04ddc69ed6cdd37c55e200f7744b1792'],
  ]);
});
