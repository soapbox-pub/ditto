import { assertEquals } from '@/deps-test.ts';

import event1 from '~/fixtures/events/event-1.json' assert { type: 'json' };

import { memorelay } from './memorelay.ts';

Deno.test('memorelay', async () => {
  assertEquals(await memorelay.countEvents([{ ids: [event1.id] }]), 0);

  await memorelay.storeEvent(event1);

  assertEquals(await memorelay.countEvents([{ ids: [event1.id] }]), 1);

  const result = await memorelay.getEvents([{ ids: [event1.id] }]);
  assertEquals(result[0], event1);
});
