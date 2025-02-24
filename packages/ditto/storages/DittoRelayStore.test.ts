import { DittoPolyPg } from '@ditto/db';
import { DittoConf } from '@ditto/conf';
import { genEvent, MockRelay } from '@nostrify/nostrify/test';
import { assertEquals } from '@std/assert';
import { generateSecretKey, getPublicKey } from 'nostr-tools';

import { DittoRelayStore } from './DittoRelayStore.ts';

import type { NostrMetadata } from '@nostrify/types';

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

function setupTest(cb: (req: Request) => Response | Promise<Response>) {
  const conf = new DittoConf(Deno.env);
  const db = new DittoPolyPg(conf.databaseUrl);
  const relay = new MockRelay();

  const mockFetch: typeof fetch = async (input, init) => {
    const req = new Request(input, init);
    return await cb(req);
  };

  const store = new DittoRelayStore({ conf, db, relay, fetch: mockFetch });

  return {
    db,
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
