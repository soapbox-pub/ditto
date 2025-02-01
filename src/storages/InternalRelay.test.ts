import { assertEquals } from '@std/assert';

import { eventFixture } from '@/test.ts';

import { InternalRelay } from './InternalRelay.ts';

Deno.test('InternalRelay', async () => {
  const relay = new InternalRelay();
  const event1 = await eventFixture('event-1');

  const promise = new Promise((resolve) => setTimeout(() => resolve(relay.event(event1)), 0));

  for await (const msg of relay.req([{}])) {
    if (msg[0] === 'EVENT') {
      assertEquals(relay.subs.size, 1);
      assertEquals(msg[2], event1);
      break;
    }
  }

  await promise;
  assertEquals(relay.subs.size, 0); // cleanup
});
