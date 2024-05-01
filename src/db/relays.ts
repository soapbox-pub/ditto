import tldts from 'tldts';

import { db } from '@/db.ts';

interface AddRelaysOpts {
  active?: boolean;
}

/** Inserts relays into the database, skipping duplicates. */
function addRelays(relays: `wss://${string}`[], opts: AddRelaysOpts = {}) {
  if (!relays.length) return Promise.resolve();
  const { active = false } = opts;

  const values = relays.map((url) => ({
    url: new URL(url).toString(),
    domain: tldts.getDomain(url)!,
    active,
  }));

  return db.insertInto('relays')
    .values(values)
    .onConflict((oc) => oc.column('url').doNothing())
    .execute();
}

/** Get a list of all known active relay URLs. */
async function getActiveRelays(): Promise<string[]> {
  const rows = await db
    .selectFrom('relays')
    .select('relays.url')
    .where('relays.active', '=', true)
    .execute();

  return rows.map((row) => row.url);
}

export { addRelays, getActiveRelays };
