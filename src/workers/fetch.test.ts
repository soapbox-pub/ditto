import { assert } from '@/deps-test.ts';

import { fetchWorker } from './fetch.ts';

Deno.test('fetchWorker', async () => {
  await sleep(2000);
  const response = await fetchWorker('https://example.com');
  const text = await response.text();
  assert(text.includes('Example Domain'));
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
