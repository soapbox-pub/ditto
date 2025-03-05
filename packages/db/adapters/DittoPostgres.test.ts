import { DittoConf } from '@ditto/conf';

import { DittoPostgres } from './DittoPostgres.ts';

const conf = new DittoConf(Deno.env);
const isPostgres = /^postgres(?:ql)?:/.test(conf.databaseUrl);

Deno.test('DittoPostgres', { ignore: !isPostgres }, async () => {
  await using db = new DittoPostgres(conf.databaseUrl);
  await db.migrate();
});
