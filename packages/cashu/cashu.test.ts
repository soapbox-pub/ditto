import { type NostrFilter, NSecSigner } from '@nostrify/nostrify';
import { NPostgres } from '@nostrify/db';
import { genEvent } from '@nostrify/nostrify/test';

import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToString, stringToBytes } from '@scure/base';
import { assertEquals } from '@std/assert';

import { DittoPolyPg, TestDB } from '@ditto/db';
import { DittoConf } from '@ditto/conf';

import { getLastRedeemedNutzap, getMintsToProofs, organizeProofs, validateAndParseWallet } from './cashu.ts';

Deno.test('validateAndParseWallet function returns valid data', async () => {
  const conf = new DittoConf(Deno.env);
  const orig = new DittoPolyPg(conf.databaseUrl);

  await using db = new TestDB(orig);
  await db.migrate();
  await db.clear();

  const store = new NPostgres(orig.kysely);

  const sk = generateSecretKey();
  const signer = new NSecSigner(sk);
  const pubkey = await signer.getPublicKey();
  const privkey = bytesToString('hex', sk);
  const p2pk = getPublicKey(stringToBytes('hex', privkey));

  // Wallet
  const wallet = genEvent({
    kind: 17375,
    content: await signer.nip44.encrypt(
      pubkey,
      JSON.stringify([
        ['privkey', privkey],
        ['mint', 'https://mint.soul.com'],
      ]),
    ),
  }, sk);
  await store.event(wallet);

  // Nutzap information
  const nutzapInfo = genEvent({
    kind: 10019,
    tags: [
      ['pubkey', p2pk],
      ['mint', 'https://mint.soul.com'],
    ],
  }, sk);
  await store.event(nutzapInfo);

  const { data, error } = await validateAndParseWallet(store, signer, pubkey);

  assertEquals(error, null);
  assertEquals(data, {
    wallet,
    nutzapInfo,
    privkey,
    p2pk,
    mints: ['https://mint.soul.com'],
  });
});

Deno.test('organizeProofs function is working', async () => {
  const conf = new DittoConf(Deno.env);
  const orig = new DittoPolyPg(conf.databaseUrl);

  await using db = new TestDB(orig);
  await db.migrate();
  await db.clear();

  const store = new NPostgres(orig.kysely);

  const sk = generateSecretKey();
  const signer = new NSecSigner(sk);
  const pubkey = await signer.getPublicKey();

  const event1 = genEvent({
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
  }, sk);
  await store.event(event1);

  const proof1 = {
    'id': '004f7adf2a04356c',
    'amount': 1,
    'secret': '6780378b186cf7ada639ce4807803ad5e4a71217688430512f35074f9bca99c0',
    'C': '03f0dd8df04427c8c53e4ae9ce8eb91c4880203d6236d1d745c788a5d7a47aaff3',
    'dleq': {
      'e': 'bd22fcdb7ede1edb52b9b8c6e1194939112928e7b4fc0176325e7671fb2bd351',
      's': 'a9ad015571a0e538d62966a16d2facf806fb956c746a3dfa41fa689486431c67',
      'r': 'b283980e30bf5a31a45e5e296e93ae9f20bf3a140c884b3b4cd952dbecc521df',
    },
  };
  const token1 = JSON.stringify({
    mint: 'https://mint-fashion.com',
    proofs: [proof1],
    del: [],
  });

  const event2 = genEvent({
    kind: 7375,
    content: await signer.nip44.encrypt(
      pubkey,
      token1,
    ),
  }, sk);
  await store.event(event2);

  const proof2 = {
    'id': '004f7adf2a04356c',
    'amount': 123,
    'secret': '6780378b186cf7ada639ce4807803ad5e4a71217688430512f35074f9bca99c0',
    'C': '03f0dd8df04427c8c53e4ae9ce8eb91c4880203d6236d1d745c788a5d7a47aaff3',
    'dleq': {
      'e': 'bd22fcdb7ede1edb52b9b8c6e1194939112928e7b4fc0176325e7671fb2bd351',
      's': 'a9ad015571a0e538d62966a16d2facf806fb956c746a3dfa41fa689486431c67',
      'r': 'b283980e30bf5a31a45e5e296e93ae9f20bf3a140c884b3b4cd952dbecc521df',
    },
  };

  const token2 = JSON.stringify({
    mint: 'https://mint-fashion.com',
    proofs: [proof2],
    del: [],
  });

  const event3 = genEvent({
    kind: 7375,
    content: await signer.nip44.encrypt(
      pubkey,
      token2,
    ),
  }, sk);
  await store.event(event3);

  const unspentProofs = await store.query([{ kinds: [7375], authors: [pubkey] }]);

  const organizedProofs = await organizeProofs(unspentProofs, signer);

  assertEquals(organizedProofs, {
    'https://mint.soul.com': {
      totalBalance: 100,
      [event1.id]: { event: event1, balance: 100 },
    },
    'https://mint-fashion.com': {
      totalBalance: 124,
      [event2.id]: { event: event2, balance: 1 },
      [event3.id]: { event: event3, balance: 123 },
    },
  });
});

Deno.test('getLastRedeemedNutzap function is working', async () => {
  const conf = new DittoConf(Deno.env);
  const orig = new DittoPolyPg(conf.databaseUrl);

  await using db = new TestDB(orig);
  await db.migrate();
  await db.clear();

  const store = new NPostgres(orig.kysely);

  const sk = generateSecretKey();
  const signer = new NSecSigner(sk);
  const pubkey = await signer.getPublicKey();

  const event1 = genEvent({
    kind: 7376,
    content: '<nip-44-encrypted>',
    created_at: Math.floor(Date.now() / 1000), // now
    tags: [
      ['e', '<event-id-of-created-token>', '', 'redeemed'],
    ],
  }, sk);
  await store.event(event1);

  const event2 = genEvent({
    kind: 7376,
    content: '<nip-44-encrypted>',
    created_at: Math.floor((Date.now() - 86400000) / 1000), // yesterday
    tags: [
      ['e', '<event-id-of-created-token>', '', 'redeemed'],
    ],
  }, sk);
  await store.event(event2);

  const event3 = genEvent({
    kind: 7376,
    content: '<nip-44-encrypted>',
    created_at: Math.floor((Date.now() - 86400000) / 1000), // yesterday
    tags: [
      ['e', '<event-id-of-created-token>', '', 'redeemed'],
    ],
  }, sk);
  await store.event(event3);

  const event4 = genEvent({
    kind: 7376,
    content: '<nip-44-encrypted>',
    created_at: Math.floor((Date.now() + 86400000) / 1000), // tomorrow
    tags: [
      ['e', '<event-id-of-created-token>', '', 'redeemed'],
    ],
  }, sk);
  await store.event(event4);

  const event = await getLastRedeemedNutzap(store, pubkey);

  assertEquals(event, event4);
});

Deno.test('getMintsToProofs function is working', async () => {
  const conf = new DittoConf(Deno.env);
  const orig = new DittoPolyPg(conf.databaseUrl);

  await using db = new TestDB(orig);
  await db.migrate();
  await db.clear();

  const store = new NPostgres(orig.kysely);

  const sk = generateSecretKey();
  const signer = new NSecSigner(sk);
  const pubkey = await signer.getPublicKey();

  const redeemedNutzap = genEvent({
    created_at: Math.floor(Date.now() / 1000), // now
    kind: 9321,
    content: 'Thanks buddy! Nice idea.',
    tags: [
      [
        'proof',
        JSON.stringify({
          id: '005c2502034d4f12',
          amount: 25,
          secret: 'z+zyxAVLRqN9lEjxuNPSyRJzEstbl69Jc1vtimvtkPg=',
          C: '0241d98a8197ef238a192d47edf191a9de78b657308937b4f7dd0aa53beae72c46',
        }),
      ],
      ['u', 'https://mint.soul.com'],
      ['e', 'nutzapped-post'],
      ['p', '47259076c85f9240e852420d7213c95e95102f1de929fb60f33a2c32570c98c4'],
    ],
  }, sk);

  await store.event(redeemedNutzap);

  await new Promise((r) => setTimeout(r, 1000));

  const history = genEvent({
    created_at: Math.floor(Date.now() / 1000), // now
    kind: 7376,
    content: 'nip-44-encrypted',
    tags: [
      ['e', redeemedNutzap.id, conf.relay, 'redeemed'],
      ['p', redeemedNutzap.pubkey],
    ],
  }, sk);

  await store.event(history);

  const nutzap = genEvent({
    created_at: Math.floor(Date.now() / 1000), // now
    kind: 9321,
    content: 'Thanks buddy! Nice idea.',
    tags: [
      [
        'proof',
        JSON.stringify({
          id: '005c2502034d4f12',
          amount: 50,
          secret: 'z+zyxAVLRqN9lEjxuNPSyRJzEstbl69Jc1vtimvtkPg=',
          C: '0241d98a8197ef238a192d47edf191a9de78b657308937b4f7dd0aa53beae72c46',
        }),
      ],
      ['u', 'https://mint.soul.com'],
      ['e', 'nutzapped-post'],
      ['p', '47259076c85f9240e852420d7213c95e95102f1de929fb60f33a2c32570c98c4'],
    ],
  }, sk);

  await store.event(nutzap);

  const nutzapsFilter: NostrFilter = {
    kinds: [9321],
    '#p': ['47259076c85f9240e852420d7213c95e95102f1de929fb60f33a2c32570c98c4'],
    '#u': ['https://mint.soul.com'],
  };

  const lastRedeemedNutzap = await getLastRedeemedNutzap(store, pubkey);
  if (lastRedeemedNutzap) {
    nutzapsFilter.since = lastRedeemedNutzap.created_at;
  }

  const mintsToProofs = await getMintsToProofs(store, nutzapsFilter, conf.relay);

  assertEquals(mintsToProofs, {
    'https://mint.soul.com': {
      proofs: [{
        id: '005c2502034d4f12',
        amount: 50,
        secret: 'z+zyxAVLRqN9lEjxuNPSyRJzEstbl69Jc1vtimvtkPg=',
        C: '0241d98a8197ef238a192d47edf191a9de78b657308937b4f7dd0aa53beae72c46',
      }],
      toBeRedeemed: [
        ['e', nutzap.id, conf.relay, 'redeemed'],
        ['p', nutzap.pubkey],
      ],
    },
  });
});
