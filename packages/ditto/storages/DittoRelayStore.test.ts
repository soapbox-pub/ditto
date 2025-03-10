import { DittoPolyPg } from '@ditto/db';
import { DittoConf } from '@ditto/conf';
import { genEvent, MockRelay } from '@nostrify/nostrify/test';
import { assertEquals } from '@std/assert';
import { waitFor } from '@std/async/unstable-wait-for';
import { generateSecretKey, getPublicKey } from 'nostr-tools';

import { DittoRelayStore } from '@/storages/DittoRelayStore.ts';

import type { NostrMetadata } from '@nostrify/types';
import { nostrNow } from '@/utils.ts';

Deno.test('generates set event for nip05 request', async () => {
  await using test = setupTest();

  const admin = await test.conf.signer.getPublicKey();
  const event = genEvent({ kind: 3036, tags: [['r', 'alex@gleasonator.dev'], ['p', admin]] });

  await test.store.event(event);

  const filter = { kinds: [30383], authors: [admin], '#d': [event.id] };

  await waitFor(async () => {
    const { count } = await test.store.count([filter]);
    return count > 0;
  }, 3000);

  const [result] = await test.store.query([filter]);

  assertEquals(result?.tags, [
    ['d', event.id],
    ['p', event.pubkey],
    ['k', '3036'],
    ['r', 'alex@gleasonator.dev'],
    ['n', 'pending'],
  ]);
});

Deno.test('updateAuthorData sets nip05', async () => {
  const alex = generateSecretKey();

  await using test = setupTest((req) => {
    switch (req.url) {
      case 'https://gleasonator.dev/.well-known/nostr.json?name=alex':
        return jsonResponse({ names: { alex: getPublicKey(alex) } });
      default:
        return new Response('Not found', { status: 404 });
    }
  });

  const { db, store } = test;

  const metadata: NostrMetadata = { nip05: 'alex@gleasonator.dev' };
  const event = genEvent({ kind: 0, content: JSON.stringify(metadata) }, alex);

  await store.updateAuthorData(event);

  const row = await db.kysely
    .selectFrom('author_stats')
    .selectAll()
    .where('pubkey', '=', getPublicKey(alex))
    .executeTakeFirst();

  assertEquals(row?.nip05, 'alex@gleasonator.dev');
  assertEquals(row?.nip05_domain, 'gleasonator.dev');
  assertEquals(row?.nip05_hostname, 'gleasonator.dev');
});

Deno.test('Admin revokes nip05 grant and nip05 column gets null', async () => {
  const alex = generateSecretKey();

  await using test = setupTest((req) => {
    switch (req.url) {
      case 'https://gleasonator.dev/.well-known/nostr.json?name=alex':
        return jsonResponse({ names: { alex: getPublicKey(alex) } });
      default:
        return new Response('Not found', { status: 404 });
    }
  });

  const { db, store, conf } = test;

  const metadata: NostrMetadata = { nip05: 'alex@gleasonator.dev' };
  const event = genEvent({ kind: 0, content: JSON.stringify(metadata) }, alex);

  await store.event(event);

  await waitFor(async () => {
    const row = await db.kysely
      .selectFrom('author_stats')
      .selectAll()
      .where('pubkey', '=', getPublicKey(alex))
      .executeTakeFirst();

    assertEquals(row?.nip05, 'alex@gleasonator.dev');
    assertEquals(row?.nip05_domain, 'gleasonator.dev');
    assertEquals(row?.nip05_hostname, 'gleasonator.dev');

    return true;
  }, 3000);

  const grant = await conf.signer.signEvent({
    kind: 30360,
    tags: [
      ['d', 'alex@gleasonator.dev'],
      ['r', 'alex@gleasonator.dev'],
      ['L', 'nip05.domain'],
      ['l', 'gleasonator.dev', 'nip05.domain'],
      ['p', event.pubkey],
      ['e', 'whatever'],
    ],
    created_at: nostrNow(),
    content: '',
  });

  await store.event(grant);

  const adminDeletion = await conf.signer.signEvent({
    kind: 5,
    tags: [
      ['k', '30360'],
      ['e', grant.id],
    ],
    created_at: nostrNow(),
    content: '',
  });

  await store.event(adminDeletion);

  const nullRow = await db.kysely
    .selectFrom('author_stats')
    .selectAll()
    .where('pubkey', '=', getPublicKey(alex))
    .executeTakeFirst();

  assertEquals(nullRow?.nip05, null);
  assertEquals(nullRow?.nip05_domain, null);
  assertEquals(nullRow?.nip05_hostname, null);
});

Deno.test('fetchRelated', async () => {
  await using test = setupTest();
  const { pool, store } = test;

  const post = genEvent({ kind: 1, content: 'hi' });
  const reply = genEvent({ kind: 1, content: 'wussup?', tags: [['e', post.id], ['p', post.pubkey]] });

  await pool.event(post);
  await pool.event(reply);

  await store.event(reply);

  await waitFor(async () => {
    const { count } = await test.store.count([{ ids: [post.id] }]);
    return count > 0;
  }, 3000);
});

Deno.test('event author is fetched', async () => {
  await using test = setupTest();
  const { pool, store } = test;

  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);

  const post = genEvent({ kind: 1 }, sk);
  const author = genEvent({ kind: 0 }, sk);

  await pool.event(author);
  await store.event(post);

  const [result] = await store.query([{ kinds: [0], authors: [pubkey] }]);

  assertEquals(result?.id, author.id);
});

function setupTest(cb?: (req: Request) => Response | Promise<Response>) {
  const conf = new DittoConf(Deno.env);
  const db = new DittoPolyPg(conf.databaseUrl);

  const pool = new MockRelay();
  const relay = new MockRelay();

  const mockFetch: typeof fetch = async (input, init) => {
    const req = new Request(input, init);
    if (cb) {
      return await cb(req);
    } else {
      return new Response('Not mocked', { status: 404 });
    }
  };

  const store = new DittoRelayStore({ conf, db, pool, relay, fetch: mockFetch });

  return {
    db,
    conf,
    pool,
    store,
    [Symbol.asyncDispose]: async () => {
      await store[Symbol.asyncDispose]();
      await db[Symbol.asyncDispose]();
    },
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
