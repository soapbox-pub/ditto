import { assertEquals } from '@/deps-test.ts';

import event1 from '~/fixtures/events/event-1.json' assert { type: 'json' };

import { memorelay } from './memorelay.ts';

Deno.test('memorelay', async () => {
  assertEquals(memorelay.hasEvent(event1), false);
  assertEquals(memorelay.hasEventById(event1.id), false);

  memorelay.insertEvent(event1);

  assertEquals(memorelay.hasEvent(event1), true);
  assertEquals(memorelay.hasEventById(event1.id), true);

  const result = await memorelay.getFilters([{ ids: [event1.id] }]);
  assertEquals(result[0], event1);
});
