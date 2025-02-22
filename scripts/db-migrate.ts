import { DittoConf } from '@ditto/conf';
import { DittoPolyPg } from '@ditto/db';

const conf = new DittoConf(Deno.env);
await using db = new DittoPolyPg(conf.databaseUrl);

await db.migrate();

Deno.exit();
