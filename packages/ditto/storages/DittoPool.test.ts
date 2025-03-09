import { DittoConf } from '@ditto/conf';
import { genEvent, MockRelay } from '@nostrify/nostrify/test';
import { assertEquals } from '@std/assert';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';

import { DittoPool } from './DittoPool.ts';

Deno.test('DittoPool.reqRouter', async (t) => {
  const nsec = generateSecretKey();
  const conf = new DittoConf(new Map([['DITTO_NSEC', nip19.nsecEncode(nsec)]]));
  const relay = new MockRelay();

  const pool = new DittoPool({ conf, relay });

  const [alex, mk] = [
    generateKeypair(),
    generateKeypair(),
  ];

  const [ditto, henhouse, gleasonator] = [
    'wss://ditto.pub/relay',
    'wss://henhouse.social/relay',
    'wss://gleasonator.dev/relay',
  ];

  const events = [
    genEvent({ kind: 10002, tags: [['r', gleasonator], ['r', ditto]] }, alex.sk),
    genEvent({ kind: 10002, tags: [['r', henhouse], ['r', ditto]] }, mk.sk),
  ];

  for (const event of events) {
    await relay.event(event);
  }

  await t.step('no authors', async () => {
    const reqRoutes = await pool.reqRouter([{ kinds: [1] }]);
    assertEquals(reqRoutes, new Map());
  });

  await t.step('single author', async () => {
    const reqRoutes = await pool.reqRouter([{ kinds: [10002], authors: [alex.pk] }]);

    const expected = new Map([
      [ditto, [{ kinds: [10002], authors: [alex.pk] }]],
      [gleasonator, [{ kinds: [10002], authors: [alex.pk] }]],
    ]);

    assertEquals(reqRoutes, expected);
  });

  await t.step('multiple authors', async () => {
    const reqRoutes = await pool.reqRouter([{ kinds: [10002], authors: [alex.pk, mk.pk] }]);

    const expected = new Map([
      [ditto, [{ kinds: [10002], authors: [alex.pk, mk.pk] }]],
      [henhouse, [{ kinds: [10002], authors: [mk.pk] }]],
      [gleasonator, [{ kinds: [10002], authors: [alex.pk] }]],
    ]);

    assertEquals(reqRoutes, expected);
  });

  await t.step('no authors with fallback', async () => {
    const fallback = genEvent({ kind: 10002, tags: [['r', ditto]] }, nsec);
    await relay.event(fallback);

    const reqRoutes = await pool.reqRouter([{ kinds: [1] }]);
    const expected = new Map([[ditto, [{ kinds: [1] }]]]);

    assertEquals(reqRoutes, expected);
  });
});

function generateKeypair(): { pk: string; sk: Uint8Array } {
  const sk = generateSecretKey();
  return { pk: getPublicKey(sk), sk };
}
