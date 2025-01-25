import { assertEquals, assertThrows } from '@std/assert';

import { MemoryRateLimiter } from './MemoryRateLimiter.ts';
import { MultiRateLimiter } from './MultiRateLimiter.ts';

Deno.test('MultiRateLimiter', async (t) => {
  using limiter1 = new MemoryRateLimiter({ limit: 5, window: 100 });
  using limiter2 = new MemoryRateLimiter({ limit: 8, window: 200 });

  const limiter = new MultiRateLimiter([limiter1, limiter2]);

  await t.step('can hit up to first limit', () => {
    for (let i = 0; i < limiter1.limit; i++) {
      const client = limiter.client('test');
      assertEquals(client.hits, i);
      client.hit();
    }
  });

  await t.step('throws when hit if first limit exceeded', () => {
    assertThrows(() => limiter.client('test').hit(), Error);
  });

  await t.step('can hit up to second limit after the first window resets', async () => {
    await new Promise((resolve) => setTimeout(resolve, limiter1.window + 1));

    const limit = limiter2.limit - limiter1.limit - 1;

    for (let i = 0; i < limit; i++) {
      const client = limiter.client('test');
      assertEquals(client.hits, i);
      client.hit();
    }
  });

  await t.step('throws when hit if second limit exceeded', () => {
    assertEquals(limiter.client('test').limiter, limiter1);
    assertThrows(() => limiter.client('test').hit(), Error);
    assertEquals(limiter.client('test').limiter, limiter2);
  });
});
