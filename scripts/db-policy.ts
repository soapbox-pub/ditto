import { policyWorker } from '../packages/ditto/workers/policy.ts';
import { Storages } from '../packages/ditto/storages.ts';

const db = await Storages.db();
let count = 0;

for await (const msg of db.req([{}])) {
  const [type, , event] = msg;
  if (type === 'EOSE') console.log('EOSE');
  if (type !== 'EVENT') continue;
  const [, , ok] = await policyWorker.call(event, AbortSignal.timeout(5000));
  if (!ok) {
    await db.remove([{ ids: [event.id] }]);
    count += 1;
  }
}

console.log(`Cleaned up ${count} events from the db.`);
Deno.exit(0);
