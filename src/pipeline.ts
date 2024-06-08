import { NKinds, NostrEvent, NSchema as n } from '@nostrify/nostrify';
import Debug from '@soapbox/stickynotes/debug';
import { sql } from 'kysely';
import { LRUCache } from 'lru-cache';

import { DittoDB } from '@/db/DittoDB.ts';
import { deleteAttachedMedia } from '@/db/unattached-media.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { RelayError } from '@/RelayError.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { Storages } from '@/storages.ts';
import { eventAge, parseNip05, Time } from '@/utils.ts';
import { policyWorker } from '@/workers/policy.ts';
import { verifyEventWorker } from '@/workers/verify.ts';
import { nip05Cache } from '@/utils/nip05.ts';
import { updateStats } from '@/utils/stats.ts';
import { getTagSet } from '@/utils/tags.ts';

const debug = Debug('ditto:pipeline');

/**
 * Common pipeline function to process (and maybe store) events.
 * It is idempotent, so it can be called multiple times for the same event.
 */
async function handleEvent(event: DittoEvent, signal: AbortSignal): Promise<void> {
  // Integer max value for Postgres. TODO: switch to a bigint in 2038.
  if (event.created_at >= 2_147_483_647) {
    throw new RelayError('blocked', 'event too far in the future');
  }
  if (event.kind >= 2_147_483_647) {
    throw new RelayError('blocked', 'event kind too large');
  }
  if (!(await verifyEventWorker(event))) return;
  if (encounterEvent(event)) return;
  if (await existsInDB(event)) return;
  debug(`NostrEvent<${event.kind}> ${event.id}`);

  if (event.kind !== 24133) {
    await policyFilter(event);
  }

  await hydrateEvent(event, signal);

  const n = getTagSet(event.user?.tags ?? [], 'n');

  if (n.has('disable')) {
    throw new RelayError('blocked', 'user is disabled');
  }
  if (n.has('suspend')) {
    throw new RelayError('blocked', 'user is suspended');
  }

  await Promise.all([
    storeEvent(event, signal),
    parseMetadata(event, signal),
    processMedia(event),
    streamOut(event),
  ]);
}

async function policyFilter(event: NostrEvent): Promise<void> {
  const debug = Debug('ditto:policy');

  try {
    const result = await policyWorker.call(event);
    debug(JSON.stringify(result));
    RelayError.assert(result);
  } catch (e) {
    if (e instanceof RelayError) {
      throw e;
    } else {
      console.error('POLICY ERROR:', e);
      throw new RelayError('blocked', 'policy error');
    }
  }
}

const encounters = new LRUCache<string, true>({ max: 1000 });

/** Encounter the event, and return whether it has already been encountered. */
function encounterEvent(event: NostrEvent): boolean {
  const encountered = !!encounters.get(event.id);
  if (!encountered) {
    encounters.set(event.id, true);
  }
  return encountered;
}

/** Check if the event already exists in the database. */
async function existsInDB(event: DittoEvent): Promise<boolean> {
  const store = await Storages.db();
  const events = await store.query([{ ids: [event.id], limit: 1 }]);
  return events.length > 0;
}

/** Hydrate the event with the user, if applicable. */
async function hydrateEvent(event: DittoEvent, signal: AbortSignal): Promise<void> {
  await hydrateEvents({ events: [event], store: await Storages.db(), signal });

  const kysely = await DittoDB.getInstance();
  const domain = await kysely
    .selectFrom('pubkey_domains')
    .select('domain')
    .where('pubkey', '=', event.pubkey)
    .executeTakeFirst();

  event.author_domain = domain?.domain;
}

/** Maybe store the event, if eligible. */
async function storeEvent(event: DittoEvent, signal?: AbortSignal): Promise<void> {
  if (NKinds.ephemeral(event.kind)) return;
  const store = await Storages.db();
  const kysely = await DittoDB.getInstance();

  await updateStats({ event, store, kysely }).catch(debug);
  await store.event(event, { signal });
}

/** Parse kind 0 metadata and track indexes in the database. */
async function parseMetadata(event: NostrEvent, signal: AbortSignal): Promise<void> {
  if (event.kind !== 0) return;

  // Parse metadata.
  const metadata = n.json().pipe(n.metadata()).catch({}).safeParse(event.content);
  if (!metadata.success) return;

  // Get nip05.
  const { nip05 } = metadata.data;
  if (!nip05) return;

  // Fetch nip05.
  const result = await nip05Cache.fetch(nip05, { signal }).catch(() => undefined);
  if (!result) return;

  // Ensure pubkey matches event.
  const { pubkey } = result;
  if (pubkey !== event.pubkey) return;

  // Track pubkey domain.
  try {
    const kysely = await DittoDB.getInstance();
    const { domain } = parseNip05(nip05);

    await sql`
    INSERT INTO pubkey_domains (pubkey, domain, last_updated_at)
    VALUES (${pubkey}, ${domain}, ${event.created_at})
    ON CONFLICT(pubkey) DO UPDATE SET
      domain = excluded.domain,
      last_updated_at = excluded.last_updated_at
    WHERE excluded.last_updated_at > pubkey_domains.last_updated_at
    `.execute(kysely);
  } catch (_e) {
    // do nothing
  }
}

/** Delete unattached media entries that are attached to the event. */
function processMedia({ tags, pubkey, user }: DittoEvent) {
  if (user) {
    const urls = getTagSet(tags, 'media');
    return deleteAttachedMedia(pubkey, [...urls]);
  }
}

/** Determine if the event is being received in a timely manner. */
function isFresh(event: NostrEvent): boolean {
  return eventAge(event) < Time.seconds(10);
}

/** Distribute the event through active subscriptions. */
async function streamOut(event: NostrEvent): Promise<void> {
  if (isFresh(event)) {
    const pubsub = await Storages.pubsub();
    await pubsub.event(event);
  }
}

export { handleEvent };
