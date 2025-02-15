import { SimpleLRU } from '@/utils/SimpleLRU.ts';
import { assertEquals, assertRejects } from '@std/assert';

Deno.test("SimpleLRU doesn't repeat failed calls", async () => {
  let calls = 0;

  using cache = new SimpleLRU(
    // deno-lint-ignore require-await
    async () => {
      calls++;
      throw new Error('gg');
    },
    { max: 100 },
  );

  await assertRejects(() => cache.fetch('foo'));
  assertEquals(calls, 1);

  await assertRejects(() => cache.fetch('foo'));
  assertEquals(calls, 1);
});
