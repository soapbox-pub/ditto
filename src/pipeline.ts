import { NostrEvent, NPolicy, NSchema as n } from '@nostrify/nostrify';
import { LNURL } from '@nostrify/nostrify/ln';
import { PipePolicy } from '@nostrify/nostrify/policies';
import Debug from '@soapbox/stickynotes/debug';
import { sql } from 'kysely';

import { Conf } from '@/config.ts';
import { db } from '@/db.ts';
import { deleteAttachedMedia } from '@/db/unattached-media.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { isEphemeralKind } from '@/kinds.ts';
import { DVM } from '@/pipeline/DVM.ts';
import { RelayError } from '@/RelayError.ts';
import { updateStats } from '@/stats.ts';
import { hydrateEvents, purifyEvent } from '@/storages/hydrate.ts';
import { Storages } from '@/storages.ts';
import { getTagSet } from '@/tags.ts';
import { eventAge, nostrDate, nostrNow, parseNip05, Time } from '@/utils.ts';
import { fetchWorker } from '@/workers/fetch.ts';
import { TrendsWorker } from '@/workers/trends.ts';
import { verifyEventWorker } from '@/workers/verify.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { lnurlCache } from '@/utils/lnurl.ts';
import { nip05Cache } from '@/utils/nip05.ts';

import { MuteListPolicy } from '@/policies/MuteListPolicy.ts';

const debug = Debug('ditto:pipeline');

/**
 * Common pipeline function to process (and maybe store) events.
 * It is idempotent, so it can be called multiple times for the same event.
 */
async function handleEvent(event: DittoEvent, signal: AbortSignal): Promise<void> {
  if (!(await verifyEventWorker(event))) return;
  if (await encounterEvent(event, signal)) return;
  debug(`NostrEvent<${event.kind}> ${event.id}`);

  if (event.kind !== 24133) {
    await policyFilter(event);
  }

  await hydrateEvent(event, signal);

  await Promise.all([
    storeEvent(event, signal),
    parseMetadata(event, signal),
    processDeletions(event, signal),
    DVM.event(event),
    trackHashtags(event),
    fetchRelatedEvents(event),
    processMedia(event),
    payZap(event, signal),
    streamOut(event),
  ]);
}

async function policyFilter(event: NostrEvent): Promise<void> {
  const policies: NPolicy[] = [
    new MuteListPolicy(Conf.pubkey, Storages.admin),
  ];

  try {
    const customPolicy = (await import('../data/policy.ts')).default;
    policies.push(new customPolicy());
  } catch (_e) {
    debug('policy not found - https://docs.soapbox.pub/ditto/policies/');
  }

  const policy = new PipePolicy(policies.reverse());

  const result = await policy.call(event);
  debug(JSON.stringify(result));

  RelayError.assert(result);
}

/** Encounter the event, and return whether it has already been encountered. */
async function encounterEvent(event: NostrEvent, signal: AbortSignal): Promise<boolean> {
  const [existing] = await Storages.cache.query([{ ids: [event.id], limit: 1 }]);
  Storages.cache.event(event);
  Storages.reqmeister.event(event, { signal });
  return !!existing;
}

/** Hydrate the event with the user, if applicable. */
async function hydrateEvent(event: DittoEvent, signal: AbortSignal): Promise<void> {
  await hydrateEvents({ events: [event], storage: Storages.db, signal });

  const domain = await db
    .selectFrom('pubkey_domains')
    .select('domain')
    .where('pubkey', '=', event.pubkey)
    .executeTakeFirst();

  event.author_domain = domain?.domain;
}

/** Maybe store the event, if eligible. */
async function storeEvent(event: DittoEvent, signal?: AbortSignal): Promise<void> {
  if (isEphemeralKind(event.kind)) return;

  const [deletion] = await Storages.db.query(
    [{ kinds: [5], authors: [Conf.pubkey, event.pubkey], '#e': [event.id], limit: 1 }],
    { signal },
  );

  if (deletion) {
    return Promise.reject(new RelayError('blocked', 'event was deleted'));
  } else {
    await Promise.all([
      Storages.db.event(event, { signal }).catch(debug),
      updateStats(event).catch(debug),
    ]);
  }
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
    const { domain } = parseNip05(nip05);

    await sql`
    INSERT INTO pubkey_domains (pubkey, domain, last_updated_at)
    VALUES (${pubkey}, ${domain}, ${event.created_at})
    ON CONFLICT(pubkey) DO UPDATE SET
      domain = excluded.domain,
      last_updated_at = excluded.last_updated_at
    WHERE excluded.last_updated_at > pubkey_domains.last_updated_at
    `.execute(db);
  } catch (_e) {
    // do nothing
  }
}

/** Query to-be-deleted events, ensure their pubkey matches, then delete them from the database. */
async function processDeletions(event: NostrEvent, signal: AbortSignal): Promise<void> {
  if (event.kind === 5) {
    const ids = getTagSet(event.tags, 'e');

    if (event.pubkey === Conf.pubkey) {
      await Storages.db.remove([{ ids: [...ids] }], { signal });
    } else {
      const events = await Storages.db.query(
        [{ ids: [...ids], authors: [event.pubkey] }],
        { signal },
      );

      const deleteIds = events.map(({ id }) => id);
      await Storages.db.remove([{ ids: deleteIds }], { signal });
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

/** Queue related events to fetch. */
async function fetchRelatedEvents(event: DittoEvent) {
  if (!event.author) {
    const signal = AbortSignal.timeout(3000);
    Storages.reqmeister.query([{ kinds: [0], authors: [event.pubkey] }], { signal })
      .then((events) => Promise.allSettled(events.map((event) => handleEvent(event, signal))))
      .catch(() => {});
  }

  for (const [name, id] of event.tags) {
    if (name === 'e') {
      const { count } = await Storages.cache.count([{ ids: [id] }]);
      if (!count) {
        const signal = AbortSignal.timeout(3000);
        Storages.reqmeister.query([{ ids: [id] }], { signal })
          .then((events) => Promise.allSettled(events.map((event) => handleEvent(event, signal))))
          .catch(() => {});
      }
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
      { amount, nostr: purifyEvent(event), lnurl },
      { fetch: fetchWorker, signal },
    );

    const signer = new AdminSigner();

    const nwcRequestEvent = await signer.signEvent({
      kind: 23194,
      content: await signer.nip04.encrypt(
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
function isFresh(event: NostrEvent): boolean {
  return eventAge(event) < Time.seconds(10);
}

/** Distribute the event through active subscriptions. */
async function streamOut(event: NostrEvent): Promise<void> {
  if (isFresh(event)) {
    await Storages.pubsub.event(event);
  }
}

export { handleEvent };
