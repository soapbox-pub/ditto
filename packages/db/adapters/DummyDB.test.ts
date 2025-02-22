import { assertEquals } from '@std/assert';
import { DummyDB } from './DummyDB.ts';

Deno.test('DummyDB', async () => {
  const db = DummyDB.create();
  const rows = await db.kysely.selectFrom('nostr_events').selectAll().execute();

  assertEquals(rows, []);
});
