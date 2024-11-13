import { assertEquals, assertRejects } from '@std/assert';

import { fetchWorker } from '@/workers/fetch.ts';

Deno.test({
  name: 'fetchWorker',
  async fn() {
    const response = await fetchWorker('https://httpbingo.org/get');
    const json = await response.json();
    assertEquals(json.headers.Host, ['httpbingo.org']);
  },
  sanitizeResources: false,
});

Deno.test({
  name: 'fetchWorker with AbortSignal',
  async fn() {
    const controller = new AbortController();
    const signal = controller.signal;

    setTimeout(() => controller.abort(), 100);
    assertRejects(() => fetchWorker('https://httpbingo.org/delay/10', { signal }));

    await new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => resolve(), { once: true });
    });
  },
  sanitizeResources: false,
});
