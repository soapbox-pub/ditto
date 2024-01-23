import { Conf } from '@/config.ts';
import { encryptAdmin } from '@/crypto.ts';
import { addRelays } from '@/db/relays.ts';
import { deleteAttachedMedia } from '@/db/unattached-media.ts';
import { Debug, LNURL, type NostrEvent } from '@/deps.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { isEphemeralKind } from '@/kinds.ts';
import { isLocallyFollowed } from '@/queries.ts';
import { updateStats } from '@/stats.ts';
import { client, eventsDB, memorelay, reqmeister } from '@/storages.ts';
import { Sub } from '@/subs.ts';
import { getTagSet } from '@/tags.ts';
import { eventAge, isRelay, nostrDate, nostrNow, Time } from '@/utils.ts';
import { fetchWorker } from '@/workers/fetch.ts';
import { TrendsWorker } from '@/workers/trends.ts';
import { verifySignatureWorker } from '@/workers/verify.ts';
import { signAdminEvent } from '@/sign.ts';
import { lnurlCache } from '@/utils/lnurl.ts';

const debug = Debug('ditto:pipeline');

/**
 * Common pipeline function to process (and maybe store) events.
 * It is idempotent, so it can be called multiple times for the same event.
 */
async function handleEvent(event: DittoEvent, signal: AbortSignal): Promise<void> {
  if (!(await verifySignatureWorker(event))) return;
  const wanted = reqmeister.isWanted(event);
  if (await encounterEvent(event, signal)) return;
  debug(`NostrEvent<${event.kind}> ${event.id}`);
  await hydrateEvent(event);

  await Promise.all([
    storeEvent(event, { force: wanted, signal }),
    processDeletions(event, signal),
    trackRelays(event),
    trackHashtags(event),
    fetchRelatedEvents(event, signal),
    processMedia(event),
    payZap(event, signal),
    streamOut(event),
    broadcast(event, signal),
  ]);
}

/** Encounter the event, and return whether it has already been encountered. */
async function encounterEvent(event: NostrEvent, signal: AbortSignal): Promise<boolean> {
  const preexisting = (await memorelay.count([{ ids: [event.id] }])) > 0;
  memorelay.event(event, { signal });
  reqmeister.event(event, { signal });
  return preexisting;
}

/** Hydrate the event with the user, if applicable. */
async function hydrateEvent(event: DittoEvent): Promise<void> {
  const [user] = await eventsDB.query([{ kinds: [30361], authors: [Conf.pubkey], limit: 1 }]);
  event.user = user;
}

/** Check if the pubkey is the `DITTO_NSEC` pubkey. */
const isAdminEvent = ({ pubkey }: NostrEvent): boolean => pubkey === Conf.pubkey;

interface StoreEventOpts {
  force: boolean;
  signal: AbortSignal;
}

/** Maybe store the event, if eligible. */
async function storeEvent(event: DittoEvent, opts: StoreEventOpts): Promise<void> {
  if (isEphemeralKind(event.kind)) return;
  const { force = false, signal } = opts;

  if (force || event.user || isAdminEvent(event) || await isLocallyFollowed(event.pubkey)) {
    const isDeleted = await eventsDB.count(
      [{ kinds: [5], authors: [Conf.pubkey, event.pubkey], '#e': [event.id], limit: 1 }],
      opts,
    ) > 0;

    if (isDeleted) {
      return Promise.reject(new RelayError('blocked', 'event was deleted'));
    } else {
      await Promise.all([
        eventsDB.event(event, { signal }).catch(debug),
        updateStats(event).catch(debug),
      ]);
    }
  } else {
    return Promise.reject(new RelayError('blocked', 'only registered users can post'));
  }
}

/** Query to-be-deleted events, ensure their pubkey matches, then delete them from the database. */
async function processDeletions(event: NostrEvent, signal: AbortSignal): Promise<void> {
  if (event.kind === 5) {
    const ids = getTagSet(event.tags, 'e');

    if (event.pubkey === Conf.pubkey) {
      await eventsDB.remove([{ ids: [...ids] }], { signal });
    } else {
      const events = await eventsDB.query(
        [{ ids: [...ids], authors: [event.pubkey] }],
        { signal },
      );

      const deleteIds = events.map(({ id }) => id);
      await eventsDB.remove([{ ids: deleteIds }], { signal });
    }
  }
}

/** Track whenever a hashtag is used, for processing trending tags. */
async function trackHashtags(event: NostrEvent): Promise<void> {
  const date = nostrDate(event.created_at);

  const tags = event.tags
    .filter((tag) => tag[0] === 't')
    .map((tag) => tag[1])
    .slice(0, 5);

  if (!tags.length) return;

  try {
    debug('tracking tags:', JSON.stringify(tags));
    await TrendsWorker.addTagUsages(event.pubkey, tags, date);
  } catch (_e) {
    // do nothing
  }
}

/** Tracks known relays in the database. */
function trackRelays(event: NostrEvent) {
  const relays = new Set<`wss://${string}`>();

  event.tags.forEach((tag) => {
    if (['p', 'e', 'a'].includes(tag[0]) && isRelay(tag[2])) {
      relays.add(tag[2]);
    }
    if (event.kind === 10002 && tag[0] === 'r' && isRelay(tag[1])) {
      relays.add(tag[1]);
    }
  });

  return addRelays([...relays]);
}

/** Queue related events to fetch. */
function fetchRelatedEvents(event: DittoEvent, signal: AbortSignal) {
  if (!event.user) {
    reqmeister.req({ kinds: [0], authors: [event.pubkey] }, { signal }).catch(() => {});
  }
  for (const [name, id, relay] of event.tags) {
    if (name === 'e' && !memorelay.count([{ ids: [id] }], { signal })) {
      reqmeister.req({ ids: [id] }, { relays: [relay] }).catch(() => {});
    }
  }
}

/** Delete unattached media entries that are attached to the event. */
function processMedia({ tags, pubkey, user }: DittoEvent) {
  if (user) {
    const urls = getTagSet(tags, 'media');
    return deleteAttachedMedia(pubkey, [...urls]);
  }
}

/** Emit Nostr Wallet Connect event from zaps so users may pay. */
async function payZap(event: DittoEvent, signal: AbortSignal) {
  if (event.kind !== 9734 || !event.user) return;

  const lnurl = event.tags.find(([name]) => name === 'lnurl')?.[1];
  const amount = Number(event.tags.find(([name]) => name === 'amount')?.[1]);

  if (!lnurl || !amount) return;

  try {
    const details = await lnurlCache.fetch(lnurl, { signal });

    if (details.tag !== 'payRequest' || !details.allowsNostr || !details.nostrPubkey) {
      throw new Error('invalid lnurl');
    }

    if (amount > details.maxSendable || amount < details.minSendable) {
      throw new Error('amount out of range');
    }

    const { pr } = await LNURL.callback(
      details.callback,
      { amount, nostr: event, lnurl },
      { fetch: fetchWorker, signal },
    );

    const nwcRequestEvent = await signAdminEvent({
      kind: 23194,
      content: await encryptAdmin(
        event.pubkey,
        JSON.stringify({ method: 'pay_invoice', params: { invoice: pr } }),
      ),
      created_at: nostrNow(),
      tags: [
        ['p', event.pubkey],
        ['e', event.id],
      ],
    });

    await handleEvent(nwcRequestEvent, signal);
  } catch (e) {
    debug('lnurl error:', e);
  }
}

/** Determine if the event is being received in a timely manner. */
const isFresh = (event: NostrEvent): boolean => eventAge(event) < Time.seconds(10);

/** Distribute the event through active subscriptions. */
function streamOut(event: NostrEvent) {
  if (!isFresh(event)) return;

  for (const sub of Sub.matches(event)) {
    sub.stream(event);
  }
}

/**
 * Publish the event to other relays.
 * This should only be done in certain circumstances, like mentioning a user or publishing deletions.
 */
function broadcast(event: DittoEvent, signal: AbortSignal) {
  if (!event.user || !isFresh(event)) return;

  if (event.kind === 5) {
    client.event(event, { signal });
  }
}

/** NIP-20 command line result. */
class RelayError extends Error {
  constructor(prefix: 'duplicate' | 'pow' | 'blocked' | 'rate-limited' | 'invalid' | 'error', message: string) {
    super(`${prefix}: ${message}`);
  }
}

export { handleEvent, RelayError };
