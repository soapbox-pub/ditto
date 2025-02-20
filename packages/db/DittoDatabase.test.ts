import { DittoDatabase } from './DittoDatabase.ts';

Deno.test('DittoDatabase', async () => {
  const db = DittoDatabase.create('memory://');
  await DittoDatabase.migrate(db.kysely);
});
