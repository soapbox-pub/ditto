import { DittoConf } from '@ditto/conf';

import { DittoPostgres } from './DittoPostgres.ts';

const conf = new DittoConf(Deno.env);
const isPostgres = /^postgres(?:ql)?:/.test(conf.databaseUrl);

Deno.test('DittoPostgres', { ignore: !isPostgres }, async () => {
  await using db = new DittoPostgres(conf.databaseUrl);
  await db.migrate();
});

// FIXME: There is a problem with postgres-js where queries just hang after the database is closed.

// Deno.test('DittoPostgres query after closing', { ignore: !isPostgres }, async () => {
//   const db = new DittoPostgres(conf.databaseUrl);
//   await db[Symbol.asyncDispose]();
//
//   await assertRejects(
//     () => db.kysely.selectFrom('nostr_events').selectAll().execute(),
//   );
// });
