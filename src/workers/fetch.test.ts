import { assertEquals, assertRejects } from '@/deps-test.ts';

import { fetchWorker } from './fetch.ts';

Deno.test({
  name: 'fetchWorker',
  async fn() {
    const response = await fetchWorker('http://httpbin.org/get');
    const json = await response.json();
    assertEquals(json.headers.Host, 'httpbin.org');
  },
  sanitizeResources: false,
});

Deno.test({
  name: 'fetchWorker with AbortSignal',
  async fn() {
    const controller = new AbortController();
    const signal = controller.signal;

    setTimeout(() => controller.abort(), 100);
    assertRejects(() => fetchWorker('http://httpbin.org/delay/10', { signal }));

    await new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => resolve(), { once: true });
    });
  },
  sanitizeResources: false,
});
