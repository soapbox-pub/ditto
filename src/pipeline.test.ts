import { assertEquals } from '@std/assert';
import { generateSecretKey } from 'nostr-tools';

import { createTestDB, genEvent, getTestDB } from '@/test.ts';
import { handleZaps } from '@/pipeline.ts';

Deno.test('store one zap receipt in nostr_events; convert it into event_zaps table format and store it', async () => {
  await using db = await createTestDB();
  const kysely = db.kysely;

  const sk = generateSecretKey();

  const event = genEvent({
    'id': '67b48a14fb66c60c8f9070bdeb37afdfcc3d08ad01989460448e4081eddda446',
    'pubkey': '9630f464cca6a5147aa8a35f0bcdd3ce485324e732fd39e09233b1d848238f31',
    'created_at': 1674164545,
    'kind': 9735,
    'tags': [
      ['p', '32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245'],
      ['P', '97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322'],
      ['e', '3624762a1274dd9636e0c552b53086d70bc88c165bc4dc0f9e836a1eaf86c3b8'],
      [
        'bolt11',
        'lnbc10u1p3unwfusp5t9r3yymhpfqculx78u027lxspgxcr2n2987mx2j55nnfs95nxnzqpp5jmrh92pfld78spqs78v9euf2385t83uvpwk9ldrlvf6ch7tpascqhp5zvkrmemgth3tufcvflmzjzfvjt023nazlhljz2n9hattj4f8jq8qxqyjw5qcqpjrzjqtc4fc44feggv7065fqe5m4ytjarg3repr5j9el35xhmtfexc42yczarjuqqfzqqqqqqqqlgqqqqqqgq9q9qxpqysgq079nkq507a5tw7xgttmj4u990j7wfggtrasah5gd4ywfr2pjcn29383tphp4t48gquelz9z78p4cq7ml3nrrphw5w6eckhjwmhezhnqpy6gyf0',
      ],
      [
        'description',
        '{"pubkey":"97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322","content":"","id":"d9cc14d50fcb8c27539aacf776882942c1a11ea4472f8cdec1dea82fab66279d","created_at":1674164539,"sig":"77127f636577e9029276be060332ea565deaf89ff215a494ccff16ae3f757065e2bc59b2e8c113dd407917a010b3abd36c8d7ad84c0e3ab7dab3a0b0caa9835d","kind":9734,"tags":[["e","3624762a1274dd9636e0c552b53086d70bc88c165bc4dc0f9e836a1eaf86c3b8"],["p","32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245"],["relays","wss://relay.damus.io","wss://nostr-relay.wlvs.space","wss://nostr.fmt.wiz.biz","wss://relay.nostr.bg","wss://nostr.oxtr.dev","wss://nostr.v0l.io","wss://brb.io","wss://nostr.bitcoiner.social","ws://monad.jb55.com:8080","wss://relay.snort.social"]]}',
      ],
      ['preimage', '5d006d2cf1e73c7148e7519a4c68adc81642ce0e25a432b2434c99f97344c15f'],
    ],
    'content': '',
  }, sk);

  await db.store.event(event);

  await handleZaps(kysely, event);
  await handleZaps(kysely, event);

  const zapReceipts = await db.store.query([{}]);
  const customEventZaps = await kysely.selectFrom('event_zaps').selectAll().execute();

  assertEquals(zapReceipts.length, 1); // basic check
  assertEquals(customEventZaps.length, 1); // basic check

  const expected = {
    receipt_id: event.id,
    target_event_id: '3624762a1274dd9636e0c552b53086d70bc88c165bc4dc0f9e836a1eaf86c3b8',
    sender_pubkey: '97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322',
    amount_millisats: 1000000,
    comment: '',
  };

  assertEquals(customEventZaps[0], expected);
});

// The function tests below only handle the edge cases and don't assert anything
// If no error happens = ok

Deno.test('zap receipt does not have a "description" tag', async () => {
  await using db = await getTestDB();
  const kysely = db.kysely;

  const sk = generateSecretKey();

  const event = genEvent({ kind: 9735 }, sk);

  await handleZaps(kysely, event);

  // no error happened = ok
});

Deno.test('zap receipt does not have a zap request stringified value in the "description" tag', async () => {
  await using db = await getTestDB();
  const kysely = db.kysely;

  const sk = generateSecretKey();

  const event = genEvent({ kind: 9735, tags: [['description', 'yolo']] }, sk);

  await handleZaps(kysely, event);

  // no error happened = ok
});

Deno.test('zap receipt does not have a "bolt11" tag', async () => {
  await using db = await getTestDB();
  const kysely = db.kysely;

  const sk = generateSecretKey();

  const event = genEvent({
    kind: 9735,
    tags: [[
      'description',
      '{"pubkey":"97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322","content":"","id":"d9cc14d50fcb8c27539aacf776882942c1a11ea4472f8cdec1dea82fab66279d","created_at":1674164539,"sig":"77127f636577e9029276be060332ea565deaf89ff215a494ccff16ae3f757065e2bc59b2e8c113dd407917a010b3abd36c8d7ad84c0e3ab7dab3a0b0caa9835d","kind":9734,"tags":[["e","3624762a1274dd9636e0c552b53086d70bc88c165bc4dc0f9e836a1eaf86c3b8"],["p","32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245"],["relays","wss://relay.damus.io","wss://nostr-relay.wlvs.space","wss://nostr.fmt.wiz.biz","wss://relay.nostr.bg","wss://nostr.oxtr.dev","wss://nostr.v0l.io","wss://brb.io","wss://nostr.bitcoiner.social","ws://monad.jb55.com:8080","wss://relay.snort.social"]]}',
    ]],
  }, sk);

  await handleZaps(kysely, event);

  // no error happened = ok
});

Deno.test('zap request inside zap receipt does not have an "e" tag', async () => {
  await using db = await getTestDB();
  const kysely = db.kysely;

  const sk = generateSecretKey();

  const event = genEvent({
    kind: 9735,
    tags: [[
      'bolt11',
      'lnbc10u1p3unwfusp5t9r3yymhpfqculx78u027lxspgxcr2n2987mx2j55nnfs95nxnzqpp5jmrh92pfld78spqs78v9euf2385t83uvpwk9ldrlvf6ch7tpascqhp5zvkrmemgth3tufcvflmzjzfvjt023nazlhljz2n9hattj4f8jq8qxqyjw5qcqpjrzjqtc4fc44feggv7065fqe5m4ytjarg3repr5j9el35xhmtfexc42yczarjuqqfzqqqqqqqqlgqqqqqqgq9q9qxpqysgq079nkq507a5tw7xgttmj4u990j7wfggtrasah5gd4ywfr2pjcn29383tphp4t48gquelz9z78p4cq7ml3nrrphw5w6eckhjwmhezhnqpy6gyf0',
    ], [
      'description',
      '{"pubkey":"97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322","content":"","id":"d9cc14d50fcb8c27539aacf776882942c1a11ea4472f8cdec1dea82fab66279d","created_at":1674164539,"sig":"77127f636577e9029276be060332ea565deaf89ff215a494ccff16ae3f757065e2bc59b2e8c113dd407917a010b3abd36c8d7ad84c0e3ab7dab3a0b0caa9835d","kind":9734,"tags":[["p","32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245"],["relays","wss://relay.damus.io","wss://nostr-relay.wlvs.space","wss://nostr.fmt.wiz.biz","wss://relay.nostr.bg","wss://nostr.oxtr.dev","wss://nostr.v0l.io","wss://brb.io","wss://nostr.bitcoiner.social","ws://monad.jb55.com:8080","wss://relay.snort.social"]]}',
    ]],
  }, sk);

  await handleZaps(kysely, event);

  // no error happened = ok
});
