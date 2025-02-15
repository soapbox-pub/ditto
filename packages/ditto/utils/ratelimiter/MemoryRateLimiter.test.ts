import { assertEquals, assertThrows } from '@std/assert';

import { MemoryRateLimiter } from './MemoryRateLimiter.ts';
import { RateLimitError } from './RateLimitError.ts';

Deno.test('MemoryRateLimiter', async (t) => {
  const limit = 5;
  const window = 100;

  using limiter = new MemoryRateLimiter({ limit, window });

  await t.step('can hit up to limit', () => {
    for (let i = 0; i < limit; i++) {
      const client = limiter.client('test');
      assertEquals(client.hits, i);
      client.hit();
    }
  });

  await t.step('throws when hit if limit exceeded', () => {
    assertThrows(() => limiter.client('test').hit(), RateLimitError);
  });

  await t.step('can hit after window resets', async () => {
    await new Promise((resolve) => setTimeout(resolve, window + 1));

    const client = limiter.client('test');
    assertEquals(client.hits, 0);
    client.hit();
  });
});
