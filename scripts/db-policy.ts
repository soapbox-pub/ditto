import { DittoConf } from '@ditto/conf';
import { DittoPolyPg } from '@ditto/db';

import { DittoPgStore } from '../packages/ditto/storages/DittoPgStore.ts';
import { PolicyWorker } from '../packages/ditto/workers/policy.ts';

const conf = new DittoConf(Deno.env);
const db = new DittoPolyPg(conf.databaseUrl);
const relay = new DittoPgStore({ db, conf });
const policyWorker = new PolicyWorker(conf);

let count = 0;

for await (const msg of relay.req([{}])) {
  const [type, , event] = msg;
  if (type === 'EOSE') console.log('EOSE');
  if (type !== 'EVENT') continue;
  const [, , ok] = await policyWorker.call(event, AbortSignal.timeout(5000));
  if (!ok) {
    await relay.remove([{ ids: [event.id] }]);
    count += 1;
  }
}

console.log(`Cleaned up ${count} events from the db.`);
Deno.exit(0);
