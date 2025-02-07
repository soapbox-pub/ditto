import { nip19 } from 'nostr-tools';
import { NIP05, NStore } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';
import { Kysely } from 'kysely';
import tldts from 'tldts';

import { Conf } from '@/config.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { cachedNip05sSizeGauge } from '@/metrics.ts';
import { Storages } from '@/storages.ts';
import { errorJson } from '@/utils/log.ts';
import { SimpleLRU } from '@/utils/SimpleLRU.ts';
import { Nip05, nostrNow, parseNip05 } from '@/utils.ts';
import { fetchWorker } from '@/workers/fetch.ts';

export const nip05Cache = new SimpleLRU<string, nip19.ProfilePointer>(
  async (nip05, { signal }) => {
    const store = await Storages.db();
    const kysely = await Storages.kysely();
    return getNip05(kysely, store, nip05, signal);
  },
  { ...Conf.caches.nip05, gauge: cachedNip05sSizeGauge },
);

async function getNip05(
  kysely: Kysely<DittoTables>,
  store: NStore,
  nip05: string,
  signal?: AbortSignal,
): Promise<nip19.ProfilePointer> {
  const tld = tldts.parse(nip05);

  if (!tld.isIcann || tld.isIp || tld.isPrivate) {
    throw new Error(`Invalid NIP-05: ${nip05}`);
  }

  logi({ level: 'info', ns: 'ditto.nip05', nip05, state: 'started' });

  let pointer: nip19.ProfilePointer | undefined = await queryNip05(kysely, nip05);

  if (pointer) {
    logi({ level: 'info', ns: 'ditto.nip05', nip05, state: 'found', source: 'db', pubkey: pointer.pubkey });
    return pointer;
  }

  const [name, domain] = nip05.split('@');

  try {
    if (domain === Conf.url.host) {
      pointer = await localNip05Lookup(store, name);
      if (pointer) {
        logi({ level: 'info', ns: 'ditto.nip05', nip05, state: 'found', source: 'local', pubkey: pointer.pubkey });
      } else {
        throw new Error(`Not found: ${nip05}`);
      }
    } else {
      pointer = await NIP05.lookup(nip05, { fetch: fetchWorker, signal });
      logi({ level: 'info', ns: 'ditto.nip05', nip05, state: 'found', source: 'fetch', pubkey: pointer.pubkey });
    }
  } catch (e) {
    logi({ level: 'info', ns: 'ditto.nip05', nip05, state: 'failed', error: errorJson(e) });
    throw e;
  }

  insertNip05(kysely, nip05, pointer.pubkey).catch((e) => {
    logi({ level: 'error', ns: 'ditto.nip05', nip05, state: 'insert_failed', error: errorJson(e) });
  });

  return pointer;
}

async function queryNip05(kysely: Kysely<DittoTables>, nip05: string): Promise<nip19.ProfilePointer | undefined> {
  const row = await kysely
    .selectFrom('author_stats')
    .select('pubkey')
    .where('nip05', '=', nip05)
    .executeTakeFirst();

  if (row) {
    return { pubkey: row.pubkey };
  }
}

async function insertNip05(kysely: Kysely<DittoTables>, nip05: string, pubkey: string, ts = nostrNow()): Promise<void> {
  const tld = tldts.parse(nip05);

  if (!tld.isIcann || tld.isIp || tld.isPrivate) {
    throw new Error(`Invalid NIP-05: ${nip05}`);
  }

  await kysely
    .insertInto('author_stats')
    .values({
      pubkey,
      nip05,
      nip05_domain: tld.domain,
      nip05_hostname: tld.hostname,
      nip05_last_verified_at: ts,
      followers_count: 0, // TODO: fix `author_stats` types so setting these aren't required
      following_count: 0,
      notes_count: 0,
      search: nip05,
    })
    .onConflict((oc) =>
      oc
        .column('pubkey')
        .doUpdateSet({
          nip05,
          nip05_domain: tld.domain,
          nip05_hostname: tld.hostname,
          nip05_last_verified_at: ts,
        })
        .where('nip05_last_verified_at', '<', ts)
    )
    .execute();
}

export async function localNip05Lookup(store: NStore, localpart: string): Promise<nip19.ProfilePointer | undefined> {
  const [grant] = await store.query([{
    kinds: [30360],
    '#d': [`${localpart}@${Conf.url.host}`],
    authors: [Conf.pubkey],
    limit: 1,
  }]);

  const pubkey = grant?.tags.find(([name]) => name === 'p')?.[1];

  if (pubkey) {
    return { pubkey, relays: [Conf.relay] };
  }
}

export async function parseAndVerifyNip05(
  nip05: string | undefined,
  pubkey: string,
  signal = AbortSignal.timeout(3000),
): Promise<Nip05 | undefined> {
  if (!nip05) return;
  try {
    const result = await nip05Cache.fetch(nip05, { signal });
    if (result.pubkey === pubkey) {
      return parseNip05(nip05);
    }
  } catch (_e) {
    // do nothing
  }
}
