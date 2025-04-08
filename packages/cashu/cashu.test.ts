import { type NostrFilter, NSecSigner } from '@nostrify/nostrify';
import { NPostgres } from '@nostrify/db';
import { genEvent } from '@nostrify/nostrify/test';

import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToString, stringToBytes } from '@scure/base';
import { assertEquals } from '@std/assert';

import { DittoPolyPg, TestDB } from '@ditto/db';
import { DittoConf } from '@ditto/conf';

import { getLastRedeemedNutzap, getMintsToProofs, getWallet, organizeProofs, validateAndParseWallet } from './cashu.ts';

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
      ['relay', conf.relay],
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
    relays: [conf.relay],
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

Deno.test('getWallet function is working', async () => {
  const conf = new DittoConf(Deno.env);
  const orig = new DittoPolyPg(conf.databaseUrl);

  await using db = new TestDB(orig);
  await db.migrate();
  await db.clear();

  const sk = generateSecretKey();
  const signer = new NSecSigner(sk);
  const pubkey = await signer.getPublicKey();

  const privkey = bytesToString('hex', sk);
  const p2pk = getPublicKey(stringToBytes('hex', privkey));

  const relay = new NPostgres(orig.kysely);

  const proofs = genEvent({
    kind: 7375,
    content: await signer.nip44.encrypt(
      pubkey,
      JSON.stringify({
        mint: 'https://cuiaba.mint.com',
        proofs: [
          {
            'id': '004f7adf2a04356c',
            'amount': 2,
            'secret': '700312ccba84cb15d6a008c1d01b0dbf00025d3f2cb01f030a756553aca52de3',
            'C': '02f0ff21fdd19a547d66d9ca09df5573ad88d28e4951825130708ba53cbed19561',
            'dleq': {
              'e': '9c44a58cb429be619c474b97216009bd96ff1b7dd145b35828a14f180c03a86f',
              's': 'a11b8f616dfee5157a2c7c36da0ee181fe71b28729bee56b789e472c027ceb3b',
              'r': 'c51b9ade8cfd3939b78d509c9723f86b43b432680f55a6791e3e252b53d4b465',
            },
          },
          {
            'id': '004f7adf2a04356c',
            'amount': 4,
            'secret': '5936f22d486734c03bd50b89aaa34be8e99f20d199bcebc09da8716890e95fb3',
            'C': '039b55f92c02243e31b04e964f2ad0bcd2ed3229e334f4c7a81037392b8411d6e7',
            'dleq': {
              'e': '7b7be700f2515f1978ca27bc1045d50b9d146bb30d1fe0c0f48827c086412b9e',
              's': 'cf44b08c7e64fd2bd9199667327b10a29b7c699b10cb7437be518203b25fe3fa',
              'r': 'ec0cf54ce2d17fae5db1c6e5e5fd5f34d7c7df18798b8d92bcb7cb005ec2f93b',
            },
          },
          {
            'id': '004f7adf2a04356c',
            'amount': 16,
            'secret': '89e2315c058f3a010972dc6d546b1a2e81142614d715c28d169c6afdba5326bd',
            'C': '02bc1c3756e77563fe6c7769fc9d9bc578ea0b84bf4bf045cf31c7e2d3f3ad0818',
            'dleq': {
              'e': '8dfa000c9e2a43d35d2a0b1c7f36a96904aed35457ca308c6e7d10f334f84e72',
              's': '9270a914b1a53e32682b1277f34c5cfa931a6fab701a5dbee5855b68ddf621ab',
              'r': 'ae71e572839a3273b0141ea2f626915592b4b3f5f91b37bbeacce0d3396332c9',
            },
          },
          {
            'id': '004f7adf2a04356c',
            'amount': 16,
            'secret': '06f2209f313d92505ae5c72087263f711b7a97b1b29a71886870e672a1b180ac',
            'C': '02fa2ad933b62449e2765255d39593c48293f10b287cf7036b23570c8f01c27fae',
            'dleq': {
              'e': 'e696d61f6259ae97f8fe13a5af55d47f526eea62a7998bf888626fd1ae35e720',
              's': 'b9f1ef2a8aec0e73c1a4aaff67e28b3ca3bc4628a532113e0733643c697ed7ce',
              'r': 'b66ed62852811d14e9bf822baebfda92ba47c5c4babc4f2499d9ce81fbbbd3f2',
            },
          },
        ],
        del: [],
      }),
    ),
    created_at: Math.floor(Date.now() / 1000), // now
  }, sk);

  await relay.event(proofs);

  await relay.event(genEvent({
    kind: 10019,
    tags: [
      ['pubkey', p2pk],
      ['mint', 'https://mint.soul.com'],
      ['mint', 'https://cuiaba.mint.com'],
      ['relay', conf.relay],
    ],
  }, sk));

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

  await relay.event(wallet);

  const { wallet: walletEntity } = await getWallet(relay, pubkey, signer);

  assertEquals(walletEntity, {
    balance: 38,
    mints: ['https://mint.soul.com', 'https://cuiaba.mint.com'],
    relays: [conf.relay],
    pubkey_p2pk: p2pk,
  });
});
