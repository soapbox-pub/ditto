import { MockRelay } from '@nostrify/nostrify/test';
import { eventFixture } from '@/test.ts';
import { getRelays } from '@/utils/outbox.ts';
import { assertEquals } from '@std/assert';

Deno.test('Get write relays - kind 10002', async () => {
  const db = new MockRelay();

  const relayListMetadata = await eventFixture('kind-10002-alex');

  await db.event(relayListMetadata);

  const relays = await getRelays(db, relayListMetadata.pubkey);

  assertEquals(relays.size, 6);
});

Deno.test('Get write relays with invalid URL - kind 10002', async () => {
  const db = new MockRelay();

  const relayListMetadata = await eventFixture('kind-10002-alex');
  relayListMetadata.tags[0] = ['r', 'yolo'];

  await db.event(relayListMetadata);

  const relays = await getRelays(db, relayListMetadata.pubkey);

  assertEquals(relays.size, 5);
});
