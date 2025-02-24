import { DittoPolyPg } from './DittoPolyPg.ts';

Deno.test('DittoPolyPg', async () => {
  const db = new DittoPolyPg('memory://');
  await db.migrate();
});
