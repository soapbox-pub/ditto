import { assertEquals } from '@std/assert';

import { DittoRoute } from './DittoRoute.ts';

Deno.test('DittoRoute', async () => {
  const route = new DittoRoute();
  const response = await route.request('/');
  const body = await response.json();

  assertEquals(response.status, 500);
  assertEquals(body, { error: 'Missing required variable: db' });
});
