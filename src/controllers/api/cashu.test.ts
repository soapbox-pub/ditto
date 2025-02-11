import { Env as HonoEnv, Hono } from '@hono/hono';
import { NostrSigner, NSecSigner, NStore } from '@nostrify/nostrify';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToString, stringToBytes } from '@scure/base';
import { assertEquals, assertExists, assertObjectMatch } from '@std/assert';

import { createTestDB, genEvent } from '@/test.ts';

import cashuApp from '@/controllers/api/cashu.ts';
import { walletSchema } from '@/schema.ts';

interface AppEnv extends HonoEnv {
  Variables: {
    /** Signer to get the logged-in user's pubkey, relays, and to sign events. */
    signer: NostrSigner;
    /** Storage for the user, might filter out unwanted content. */
    store: NStore;
  };
}

Deno.test('PUT /wallet must be successful', {
  sanitizeOps: false, // postgres.js calls 'setTimeout' without calling 'clearTimeout'
  sanitizeResources: false, // postgres.js calls 'setTimeout' without calling 'clearTimeout'
}, async () => {
  await using db = await createTestDB();
  const store = db.store;

  const sk = generateSecretKey();
  const signer = new NSecSigner(sk);
  const nostrPrivateKey = bytesToString('hex', sk);

  const app = new Hono<AppEnv>().use(
    async (c, next) => {
      c.set('signer', signer);
      await next();
    },
    async (c, next) => {
      c.set('store', store);
      await next();
    },
  ).route('/', cashuApp);

  const response = await app.request('/wallet', {
    method: 'PUT',
    headers: [['content-type', 'application/json']],
    body: JSON.stringify({
      mints: [
        'https://houston.mint.com',
        'https://houston.mint.com', // duplicate on purpose
        'https://cuiaba.mint.com',
      ],
    }),
  });

  assertEquals(response.status, 200);

  const pubkey = await signer.getPublicKey();

  const [wallet] = await store.query([{ authors: [pubkey], kinds: [17375] }]);

  assertExists(wallet);
  assertEquals(wallet.kind, 17375);

  const { data, success } = walletSchema.safeParse(await response.json());

  assertEquals(success, true);
  if (!data) return; // get rid of typescript error possibly undefined

  const decryptedContent: string[][] = JSON.parse(await signer.nip44.decrypt(pubkey, wallet.content));

  const privkey = decryptedContent.find(([value]) => value === 'privkey')?.[1]!;
  const p2pk = getPublicKey(stringToBytes('hex', privkey));

  assertEquals(nostrPrivateKey !== privkey, true);

  assertEquals(data.pubkey_p2pk, p2pk);
  assertEquals(data.mints, [
    'https://houston.mint.com',
    'https://cuiaba.mint.com',
  ]);
  assertEquals(data.relays, [
    'ws://localhost:4036/relay',
  ]);
  assertEquals(data.balance, 0);

  const [nutzap_info] = await store.query([{ authors: [pubkey], kinds: [10019] }]);

  assertExists(nutzap_info);
  assertEquals(nutzap_info.kind, 10019);
  assertEquals(nutzap_info.tags.length, 4);

  const nutzap_p2pk = nutzap_info.tags.find(([value]) => value === 'pubkey')?.[1]!;

  assertEquals(nutzap_p2pk, p2pk);
  assertEquals([nutzap_info.tags.find(([name]) => name === 'relay')?.[1]!], [
    'ws://localhost:4036/relay',
  ]);
});

Deno.test('PUT /wallet must NOT be successful', {
  sanitizeOps: false, // postgres.js calls 'setTimeout' without calling 'clearTimeout'
  sanitizeResources: false, // postgres.js calls 'setTimeout' without calling 'clearTimeout'
}, async () => {
  await using db = await createTestDB();
  const store = db.store;

  const sk = generateSecretKey();
  const signer = new NSecSigner(sk);

  const app = new Hono<AppEnv>().use(
    async (c, next) => {
      c.set('signer', signer);
      await next();
    },
    async (c, next) => {
      c.set('store', store);
      await next();
    },
  ).route('/', cashuApp);

  const response = await app.request('/wallet', {
    method: 'PUT',
    headers: [['content-type', 'application/json']],
    body: JSON.stringify({
      mints: [], // no mints should throw an error
    }),
  });

  const body = await response.json();

  assertEquals(response.status, 400);
  assertObjectMatch(body, { error: 'Bad schema' });

  await db.store.event(genEvent({ kind: 17375 }, sk));

  const response2 = await app.request('/wallet', {
    method: 'PUT',
    headers: [['content-type', 'application/json']],
    body: JSON.stringify({
      mints: ['https://mint.heart.com'],
    }),
  });

  const body2 = await response2.json();

  assertEquals(response2.status, 400);
  assertEquals(body2, { error: 'You already have a wallet 😏' });
});
