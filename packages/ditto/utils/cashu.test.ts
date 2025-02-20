import { NSecSigner } from '@nostrify/nostrify';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToString, stringToBytes } from '@scure/base';
import { assertEquals } from '@std/assert';

import { createTestDB, genEvent } from '@/test.ts';

import { validateAndParseWallet } from '@/utils/cashu.ts';

Deno.test('validateAndParseWallet function returns valid data', async () => {
  await using db = await createTestDB({ pure: true });
  const store = db.store;

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
  await db.store.event(wallet);

  // Nutzap information
  const nutzapInfo = genEvent({
    kind: 10019,
    tags: [
      ['pubkey', p2pk],
      ['mint', 'https://mint.soul.com'],
    ],
  }, sk);
  await db.store.event(nutzapInfo);

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
