import { NSecSigner } from '@nostrify/nostrify';
import { NPostgres } from '@nostrify/db';
import { genEvent } from '@nostrify/nostrify/test';

import { generateSecretKey } from 'nostr-tools';
import { assertEquals } from '@std/assert';

import { DittoPolyPg, TestDB } from '@ditto/db';
import { DittoConf } from '@ditto/conf';
import { renderTransaction } from './views.ts';

Deno.test('renderTransaction function is working', async () => {
  const conf = new DittoConf(Deno.env);
  const orig = new DittoPolyPg(conf.databaseUrl);

  await using db = new TestDB(orig);
  await db.migrate();
  await db.clear();

  const sk = generateSecretKey();
  const signer = new NSecSigner(sk);
  const pubkey = await signer.getPublicKey();

  const relay = new NPostgres(orig.kysely);

  const history1 = genEvent({
    kind: 7376,
    content: await signer.nip44.encrypt(
      pubkey,
      JSON.stringify([
        ['direction', 'in'],
        ['amount', '33'],
      ]),
    ),
    created_at: Math.floor(Date.now() / 1000), // now
  }, sk);
  await relay.event(history1);

  const history2 = genEvent({
    kind: 7376,
    content: await signer.nip44.encrypt(
      pubkey,
      JSON.stringify([
        ['direction', 'out'],
        ['amount', '29'],
      ]),
    ),
    created_at: Math.floor(Date.now() / 1000) - 1, // now - 1 second
  }, sk);
  await relay.event(history2);

  const history3 = genEvent({
    kind: 7376,
    content: await signer.nip44.encrypt(
      pubkey,
      JSON.stringify([
        ['direction', 'ouch'],
        ['amount', 'yolo'],
      ]),
    ),
    created_at: Math.floor(Date.now() / 1000) - 2, // now - 2 second
  }, sk);
  await relay.event(history3);

  const events = await relay.query([{ kinds: [7376], authors: [pubkey], since: history2.created_at }]);

  const transactions = await Promise.all(
    events.map((event) => {
      return renderTransaction(event, pubkey, signer);
    }),
  );

  assertEquals(transactions, [
    {
      direction: 'in',
      amount: 33,
      created_at: history1.created_at,
    },
    {
      direction: 'out',
      amount: 29,
      created_at: history2.created_at,
    },
  ]);
});
