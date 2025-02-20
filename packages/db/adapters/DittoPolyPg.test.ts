import { DittoPolyPg } from './DittoPolyPg.ts';

Deno.test('DittoPolyPg', async () => {
  const db = DittoPolyPg.create('memory://');
  await DittoPolyPg.migrate(db.kysely);
});
