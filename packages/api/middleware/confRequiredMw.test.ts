import { Hono } from '@hono/hono';
import { assertEquals } from '@std/assert';

import { confMw } from './confMw.ts';
import { confRequiredMw } from './confRequiredMw.ts';

Deno.test('confRequiredMw', async (t) => {
  const app = new Hono();

  app.get('/without', confRequiredMw, (c) => c.text('ok'));
  app.get('/with', confMw(new Map()), confRequiredMw, (c) => c.text('ok'));

  await t.step('without conf returns 500', async () => {
    const response = await app.request('/without');
    assertEquals(response.status, 500);
  });

  await t.step('with conf returns 200', async () => {
    const response = await app.request('/with');
    assertEquals(response.status, 200);
  });
});
