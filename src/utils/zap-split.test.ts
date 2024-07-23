import { assertEquals } from '@std/assert';
import { generateSecretKey, getPublicKey } from 'nostr-tools';

import { genEvent } from '@/test.ts';
import { getZapSplits } from '@/utils/zap-split.ts';
import { getTestDB } from '@/test.ts';

Deno.test('Get zap splits in DittoZapSplits format', async () => {
  const { store } = await getTestDB();

  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);

  const event = genEvent({
    kind: 30078,
    tags: [
      ['d', 'pub.ditto.zapSplits'],
      ['p', '47259076c85f9240e852420d7213c95e95102f1de929fb60f33a2c32570c98c4', '2', 'Patrick developer'],
      ['p', '0461fcbecc4c3374439932d6b8f11269ccdb7cc973ad7a50ae362db135a474dd', '3', 'Alex creator of Ditto'],
    ],
  }, sk);
  await store.event(event);

  const eventFromDb = await store.query([{ kinds: [30078], authors: [pubkey] }]);

  assertEquals(eventFromDb.length, 1);

  const zapSplits = await getZapSplits(store, pubkey);

  assertEquals(zapSplits, {
    '0461fcbecc4c3374439932d6b8f11269ccdb7cc973ad7a50ae362db135a474dd': ['3', 'Alex creator of Ditto'],
    '47259076c85f9240e852420d7213c95e95102f1de929fb60f33a2c32570c98c4': ['2', 'Patrick developer'],
  });

  assertEquals(await getZapSplits(store, 'garbage'), undefined);
});

Deno.test('Zap split is empty', async () => {
  const { store } = await getTestDB();

  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);

  const event = genEvent({
    kind: 30078,
    tags: [
      ['d', 'pub.ditto.zapSplits'],
      ['p', 'baka'],
    ],
  }, sk);
  await store.event(event);

  const eventFromDb = await store.query([{ kinds: [30078], authors: [pubkey] }]);

  assertEquals(eventFromDb.length, 1);

  const zapSplits = await getZapSplits(store, pubkey);

  assertEquals(zapSplits, {});
});
