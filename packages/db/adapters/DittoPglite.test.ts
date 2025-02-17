import { assertEquals } from '@std/assert';

import { DittoPglite } from './DittoPglite.ts';

Deno.test('DittoPglite.create', async () => {
  const db = DittoPglite.create('memory://');

  assertEquals(db.poolSize, 1);
  assertEquals(db.availableConnections, 1);

  await db.kysely.destroy();
  await new Promise((resolve) => setTimeout(resolve, 100));
});
