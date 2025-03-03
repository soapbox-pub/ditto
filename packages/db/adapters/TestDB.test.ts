import { DittoConf } from '@ditto/conf';
import { NPostgres } from '@nostrify/db';
import { genEvent } from '@nostrify/nostrify/test';
import { assertEquals } from '@std/assert';

import { DittoPolyPg } from './DittoPolyPg.ts';
import { TestDB } from './TestDB.ts';

Deno.test('TestDB', async () => {
  const conf = new DittoConf(Deno.env);
  const orig = new DittoPolyPg(conf.databaseUrl);

  await using db = new TestDB(orig);
  await db.migrate();
  await db.clear();

  const store = new NPostgres(orig.kysely);
  await store.event(genEvent());

  assertEquals((await store.count([{}])).count, 1);

  await db.clear();

  assertEquals((await store.count([{}])).count, 0);
});
