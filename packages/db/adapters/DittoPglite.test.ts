import { assertEquals } from '@std/assert';

import { DittoPglite } from './DittoPglite.ts';

Deno.test('DittoPglite.create', () => {
  const db = DittoPglite.create('memory://');

  assertEquals(db.poolSize, 1);
  assertEquals(db.availableConnections, 1);
});
