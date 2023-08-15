import { db } from '@/db.ts';

/** Inserts relays into the database, skipping duplicates. */
function addRelays(relays: `wss://${string}`[]) {
  if (!relays.length) return Promise.resolve();
  const values = relays.map((url) => ({ url }));

  return db.insertInto('relays')
    .values(values)
    .onConflict((oc) => oc.column('url').doNothing())
    .execute();
}

/** Get a list of all known good relays. */
async function getAllRelays(): Promise<string[]> {
  const rows = await db.selectFrom('relays').select('relays.url').execute();
  return rows.map((row) => row.url);
}

export { addRelays, getAllRelays };
