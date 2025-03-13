import { DittoConf } from '@ditto/conf';
import { type User } from '@ditto/mastoapi/middleware';
import { DittoApp, DittoMiddleware } from '@ditto/mastoapi/router';
import { NSecSigner } from '@nostrify/nostrify';
import { genEvent } from '@nostrify/nostrify/test';
import { bytesToString, stringToBytes } from '@scure/base';
import { stub } from '@std/testing/mock';
import { assertEquals, assertExists, assertObjectMatch } from '@std/assert';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';

import cashuRoute from '@/controllers/api/cashu.ts';
import { createTestDB } from '@/test.ts';
import { walletSchema } from '@/schema.ts';

Deno.test('PUT /wallet must be successful', async () => {
  const mock = stub(globalThis, 'fetch', () => {
    return Promise.resolve(new Response());
  });

  await using test = await createTestRoute();

  const { route, signer, sk, relay } = test;
  const nostrPrivateKey = bytesToString('hex', sk);

  const response = await route.request('/wallet', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
    },
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

  const [wallet] = await relay.query([{ authors: [pubkey], kinds: [17375] }]);

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

  const [nutzap_info] = await relay.query([{ authors: [pubkey], kinds: [10019] }]);

  assertExists(nutzap_info);
  assertEquals(nutzap_info.kind, 10019);
  assertEquals(nutzap_info.tags.length, 4);

  const nutzap_p2pk = nutzap_info.tags.find(([value]) => value === 'pubkey')?.[1]!;

  assertEquals(nutzap_p2pk, p2pk);
  assertEquals([nutzap_info.tags.find(([name]) => name === 'relay')?.[1]!], [
    'ws://localhost:4036/relay',
  ]);

  mock.restore();
});

Deno.test('PUT /wallet must NOT be successful: wrong request body/schema', async () => {
  const mock = stub(globalThis, 'fetch', () => {
    return Promise.resolve(new Response());
  });

  await using test = await createTestRoute();
  const { route } = test;

  const response = await route.request('/wallet', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      mints: [], // no mints should throw an error
    }),
  });

  const body = await response.json();

  assertEquals(response.status, 400);
  assertObjectMatch(body, { error: 'Bad schema' });

  mock.restore();
});

Deno.test('PUT /wallet must NOT be successful: wallet already exists', async () => {
  const mock = stub(globalThis, 'fetch', () => {
    return Promise.resolve(new Response());
  });

  await using test = await createTestRoute();
  const { route, sk, relay } = test;

  await relay.event(genEvent({ kind: 17375 }, sk));

  const response = await route.request('/wallet', {
    method: 'PUT',
    headers: {
      'authorization': `Bearer ${nip19.nsecEncode(sk)}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      mints: ['https://mint.heart.com'],
    }),
  });

  const body2 = await response.json();

  assertEquals(response.status, 400);
  assertEquals(body2, { error: 'You already have a wallet 😏' });

  mock.restore();
});

Deno.test('GET /wallet must be successful', async () => {
  const mock = stub(globalThis, 'fetch', () => {
    return Promise.resolve(new Response());
  });

  await using test = await createTestRoute();
  const { route, sk, relay, signer } = test;

  const pubkey = await signer.getPublicKey();
  const privkey = bytesToString('hex', sk);
  const p2pk = getPublicKey(stringToBytes('hex', privkey));

  // Wallet
  await relay.event(genEvent({
    kind: 17375,
    content: await signer.nip44.encrypt(
      pubkey,
      JSON.stringify([
        ['privkey', privkey],
        ['mint', 'https://mint.soul.com'],
      ]),
    ),
  }, sk));

  // Nutzap information
  await relay.event(genEvent({
    kind: 10019,
    tags: [
      ['pubkey', p2pk],
      ['mint', 'https://mint.soul.com'],
    ],
  }, sk));

  // Unspent proofs
  await relay.event(genEvent({
    kind: 7375,
    content: await signer.nip44.encrypt(
      pubkey,
      JSON.stringify({
        mint: 'https://mint.soul.com',
        proofs: [
          {
            id: '005c2502034d4f12',
            amount: 25,
            secret: 'z+zyxAVLRqN9lEjxuNPSyRJzEstbl69Jc1vtimvtkPg=',
            C: '0241d98a8197ef238a192d47edf191a9de78b657308937b4f7dd0aa53beae72c46',
          },
          {
            id: '005c2502034d4f12',
            amount: 25,
            secret: 'z+zyxAVLRqN9lEjxuNPSyRJzEstbl69Jc1vtimvtkPg=',
            C: '0241d98a8197ef238a192d47edf191a9de78b657308937b4f7dd0aa53beae72c46',
          },
          {
            id: '005c2502034d4f12',
            amount: 25,
            secret: 'z+zyxAVLRqN9lEjxuNPSyRJzEstbl69Jc1vtimvtkPg=',
            C: '0241d98a8197ef238a192d47edf191a9de78b657308937b4f7dd0aa53beae72c46',
          },
          {
            id: '005c2502034d4f12',
            amount: 25,
            secret: 'z+zyxAVLRqN9lEjxuNPSyRJzEstbl69Jc1vtimvtkPg=',
            C: '0241d98a8197ef238a192d47edf191a9de78b657308937b4f7dd0aa53beae72c46',
          },
        ],
        del: [],
      }),
    ),
  }, sk));

  // TODO: find a way to have a Mock mint so operations like 'swap', 'mint' and 'melt' can be tested (this will be a bit hard).
  // Nutzap
  const senderSk = generateSecretKey();

  await relay.event(genEvent({
    kind: 9321,
    content: 'Nice post!',
    tags: [
      ['p', pubkey],
      ['u', 'https://mint.soul.com'],
      [
        'proof',
        '{"amount":1,"C":"02277c66191736eb72fce9d975d08e3191f8f96afb73ab1eec37e4465683066d3f","id":"000a93d6f8a1d2c4","secret":"[\\"P2PK\\",{\\"nonce\\":\\"b00bdd0467b0090a25bdf2d2f0d45ac4e355c482c1418350f273a04fedaaee83\\",\\"data\\":\\"02eaee8939e3565e48cc62967e2fde9d8e2a4b3ec0081f29eceff5c64ef10ac1ed\\"}]"}',
      ],
    ],
  }, senderSk));

  const response = await route.request('/wallet', {
    method: 'GET',
  });

  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body, {
    pubkey_p2pk: p2pk,
    mints: ['https://mint.soul.com'],
    relays: ['ws://localhost:4036/relay'],
    balance: 100,
  });

  mock.restore();
});

Deno.test('GET /mints must be successful', async () => {
  await using test = await createTestRoute();
  const { route } = test;

  const response = await route.request('/mints', {
    method: 'GET',
  });

  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body, { mints: [] });
});

async function createTestRoute() {
  const conf = new DittoConf(new Map());

  const db = await createTestDB();
  const relay = db.store;

  const sk = generateSecretKey();
  const signer = new NSecSigner(sk);

  const route = new DittoApp({ db: db.db, relay, conf });

  route.use(testUserMiddleware({ signer, relay }));
  route.route('/', cashuRoute);

  return {
    route,
    db,
    conf,
    sk,
    signer,
    relay,
    [Symbol.asyncDispose]: async () => {
      await db[Symbol.asyncDispose]();
    },
  };
}

function testUserMiddleware(user: User<NSecSigner>): DittoMiddleware<{ user: User<NSecSigner> }> {
  return async (c, next) => {
    c.set('user', user);
    await next();
  };
}
