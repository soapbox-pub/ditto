import { assertRejects } from '@std/assert';

import { DittoRoute } from './DittoRoute.ts';

Deno.test('DittoRoute', async () => {
  const route = new DittoRoute();

  await assertRejects(
    async () => {
      await route.request('/');
    },
    Error,
    'Missing required variable: db',
  );
});
