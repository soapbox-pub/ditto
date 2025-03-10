import { assertEquals, assertRejects } from '@std/assert';

import { DittoPglite } from './DittoPglite.ts';

Deno.test('DittoPglite', async () => {
  await using db = new DittoPglite('memory://');
  await db.migrate();

  assertEquals(db.poolSize, 1);
  assertEquals(db.availableConnections, 1);
});

Deno.test('DittoPglite query after closing', async () => {
  const db = new DittoPglite('memory://');
  await db[Symbol.asyncDispose]();

  await assertRejects(
    () => db.kysely.selectFrom('nostr_events').selectAll().execute(),
    Error,
    'PGlite is closed',
  );
});
