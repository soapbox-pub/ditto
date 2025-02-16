import { DittoDB } from './DittoDB.ts';

Deno.test('DittoDB', async () => {
  const db = DittoDB.create('memory://');
  await DittoDB.migrate(db.kysely);
});
