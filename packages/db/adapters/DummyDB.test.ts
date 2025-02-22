import { assertEquals } from '@std/assert';
import { DummyDB } from './DummyDB.ts';

Deno.test('DummyDB', async () => {
  const db = new DummyDB();
  const rows = await db.kysely.selectFrom('nostr_events').selectAll().execute();

  assertEquals(rows, []);
});
