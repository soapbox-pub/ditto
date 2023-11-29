import { assert, assertRejects } from '@/deps-test.ts';

import { fetchWorker } from './fetch.ts';

await sleep(2000);

Deno.test('fetchWorker', async () => {
  const response = await fetchWorker('https://example.com');
  const text = await response.text();
  assert(text.includes('Example Domain'));
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
