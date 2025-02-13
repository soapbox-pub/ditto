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

Deno.test('PUT /wallet must be successful', async () => {
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

Deno.test('PUT /wallet must NOT be successful: wrong request body/schema', async () => {
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
});

Deno.test('PUT /wallet must NOT be successful: wallet already exists', async () => {
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

  await db.store.event(genEvent({ kind: 17375 }, sk));

  const response = await app.request('/wallet', {
    method: 'PUT',
    headers: [['content-type', 'application/json']],
    body: JSON.stringify({
      mints: ['https://mint.heart.com'],
    }),
  });

  const body2 = await response.json();

  assertEquals(response.status, 400);
  assertEquals(body2, { error: 'You already have a wallet 😏' });
});

Deno.test('GET /wallet must be successful', async () => {
  await using db = await createTestDB();
  const store = db.store;

  const sk = generateSecretKey();
  const signer = new NSecSigner(sk);
  const pubkey = await signer.getPublicKey();
  const privkey = bytesToString('hex', sk);
  const p2pk = getPublicKey(stringToBytes('hex', privkey));

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

  // Wallet
  await db.store.event(genEvent({
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
  await db.store.event(genEvent({
    kind: 10019,
    tags: [
      ['pubkey', p2pk],
      ['mint', 'https://mint.soul.com'],
    ],
  }, sk));

  // Unspent proofs
  await db.store.event(genEvent({
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

  await db.store.event(genEvent({
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

  const response = await app.request('/wallet', {
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
});

Deno.test('GET /mints must be successful', async () => {
  const app = new Hono<AppEnv>().route('/', cashuApp);

  const response = await app.request('/mints', {
    method: 'GET',
  });

  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body, { mints: [] });
});
