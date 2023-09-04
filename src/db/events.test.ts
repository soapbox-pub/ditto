import event55920b75 from '~/fixtures/events/55920b75.json' assert { type: 'json' };
import { assertEquals } from '@/deps-test.ts';

import { countFilters, deleteFilters, getFilters, insertEvent } from './events.ts';

Deno.test('count filters', async () => {
  assertEquals(await countFilters([{ kinds: [1] }]), 0);
  await insertEvent(event55920b75);
  assertEquals(await countFilters([{ kinds: [1] }]), 1);
});

Deno.test('insert and filter events', async () => {
  await insertEvent(event55920b75);

  assertEquals(await getFilters([{ kinds: [1] }]), [event55920b75]);
  assertEquals(await getFilters([{ kinds: [3] }]), []);
  assertEquals(await getFilters([{ since: 1691091000 }]), [event55920b75]);
  assertEquals(await getFilters([{ until: 1691091000 }]), []);
  assertEquals(
    await getFilters([{ '#proxy': ['https://gleasonator.com/objects/8f6fac53-4f66-4c6e-ac7d-92e5e78c3e79'] }]),
    [event55920b75],
  );
});

Deno.test('delete events', async () => {
  await insertEvent(event55920b75);
  assertEquals(await getFilters([{ kinds: [1] }]), [event55920b75]);
  await deleteFilters([{ kinds: [1] }]);
  assertEquals(await getFilters([{ kinds: [1] }]), []);
});
