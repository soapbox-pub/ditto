import { assertEquals } from '@std/assert';

import { DittoPglite } from './DittoPglite.ts';

Deno.test('DittoPglite', async () => {
  const db = new DittoPglite('memory://');
  await db.migrate();

  assertEquals(db.poolSize, 1);
  assertEquals(db.availableConnections, 1);

  await db.kysely.destroy();
  await new Promise((resolve) => setTimeout(resolve, 100));
});
