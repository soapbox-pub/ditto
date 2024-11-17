import { policyWorker } from '@/workers/policy.ts';
import { Storages } from '@/storages.ts';

const db = await Storages.db();
const ids = [];

for await (const msg of db.req([{}])) {
  const [type, , event] = msg;
  if (type === 'EOSE') console.log('EOSE');
  if (type !== 'EVENT') continue;
  const [, , ok] = await policyWorker.call(event, AbortSignal.timeout(5000));
  if (!ok) ids.push(event.id);
}

try {
  await db.remove([{ ids }]);
  console.log(`Cleaned up ${ids.length} events from the db.`);
  Deno.exit(0);
} catch (e) {
  console.error(e);
  Deno.exit(1);
}
