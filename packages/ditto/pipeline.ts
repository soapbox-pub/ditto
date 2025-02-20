import { DittoTables } from '@ditto/db';
import { pipelineEventsCounter, policyEventsCounter, webPushNotificationsCounter } from '@ditto/metrics';
import { NKinds, NostrEvent, NSchema as n } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';
import { Kysely, UpdateObject } from 'kysely';
import tldts from 'tldts';
import { z } from 'zod';

import { pipelineEncounters } from '@/caches/pipelineEncounters.ts';
import { Conf } from '@/config.ts';
import { DittoPush } from '@/DittoPush.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { RelayError } from '@/RelayError.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { Storages } from '@/storages.ts';
import { eventAge, Time } from '@/utils.ts';
import { getAmount } from '@/utils/bolt11.ts';
import { faviconCache } from '@/utils/favicon.ts';
import { errorJson } from '@/utils/log.ts';
import { nip05Cache } from '@/utils/nip05.ts';
import { parseNoteContent, stripimeta } from '@/utils/note.ts';
import { purifyEvent } from '@/utils/purify.ts';
import { updateStats } from '@/utils/stats.ts';
import { getTagSet } from '@/utils/tags.ts';
import { unfurlCardCached } from '@/utils/unfurl.ts';
import { renderWebPushNotification } from '@/views/mastodon/push.ts';
import { policyWorker } from '@/workers/policy.ts';
import { verifyEventWorker } from '@/workers/verify.ts';

interface PipelineOpts {
  signal: AbortSignal;
  source: 'relay' | 'api' | 'firehose' | 'pipeline' | 'notify' | 'internal';
}

/**
 * Common pipeline function to process (and maybe store) events.
 * It is idempotent, so it can be called multiple times for the same event.
 */
async function handleEvent(event: DittoEvent, opts: PipelineOpts): Promise<void> {
  // Skip events that have already been encountered.
  if (pipelineEncounters.get(event.id)) {
    throw new RelayError('duplicate', 'already have this event');
  }
  // Reject events that are too far in the future.
  if (eventAge(event) < -Time.minutes(1)) {
    throw new RelayError('invalid', 'event too far in the future');
  }
  // Integer max value for Postgres.
  if (event.kind >= 2_147_483_647) {
    throw new RelayError('invalid', 'event kind too large');
  }
  // The only point of ephemeral events is to stream them,
  // so throw an error if we're not even going to do that.
  if (NKinds.ephemeral(event.kind) && !isFresh(event)) {
    throw new RelayError('invalid', 'event too old');
  }
  // Block NIP-70 events, because we have no way to `AUTH`.
  if (isProtectedEvent(event)) {
    throw new RelayError('invalid', 'protected event');
  }
  // Validate the event's signature.
  if (!(await verifyEventWorker(event))) {
    throw new RelayError('invalid', 'invalid signature');
  }
  // Recheck encountered after async ops.
  if (pipelineEncounters.has(event.id)) {
    throw new RelayError('duplicate', 'already have this event');
  }
  // Set the event as encountered after verifying the signature.
  pipelineEncounters.set(event.id, true);

  // Log the event.
  logi({ level: 'debug', ns: 'ditto.event', source: 'pipeline', id: event.id, kind: event.kind });
  pipelineEventsCounter.inc({ kind: event.kind });

  // NIP-46 events get special treatment.
  // They are exempt from policies and other side-effects, and should be streamed out immediately.
  // If streaming fails, an error should be returned.
  if (event.kind === 24133) {
    const store = await Storages.db();
    await store.event(event, { signal: opts.signal });
  }

  // Ensure the event doesn't violate the policy.
  if (event.pubkey !== await Conf.signer.getPublicKey()) {
    await policyFilter(event, opts.signal);
  }

  // Prepare the event for additional checks.
  // FIXME: This is kind of hacky. Should be reorganized to fetch only what's needed for each stage.
  await hydrateEvent(event, opts.signal);

  // Ensure that the author is not banned.
  const n = getTagSet(event.user?.tags ?? [], 'n');
  if (n.has('disabled')) {
    throw new RelayError('blocked', 'author is blocked');
  }

  const kysely = await Storages.kysely();

  try {
    await storeEvent(purifyEvent(event), opts.signal);
  } finally {
    // This needs to run in steps, and should not block the API from responding.
    Promise.allSettled([
      handleZaps(kysely, event),
      updateAuthorData(event, opts.signal),
      prewarmLinkPreview(event, opts.signal),
      generateSetEvents(event),
    ])
      .then(() => webPush(event))
      .catch(() => {});
  }
}

async function policyFilter(event: NostrEvent, signal: AbortSignal): Promise<void> {
  try {
    const result = await policyWorker.call(event, signal);
    const [, , ok, reason] = result;
    logi({ level: 'debug', ns: 'ditto.policy', id: event.id, kind: event.kind, ok, reason });
    policyEventsCounter.inc({ ok: String(ok) });
    RelayError.assert(result);
  } catch (e) {
    if (e instanceof RelayError) {
      throw e;
    } else {
      logi({ level: 'error', ns: 'ditto.policy', id: event.id, kind: event.kind, error: errorJson(e) });
      throw new RelayError('blocked', 'policy error');
    }
  }
}

/** Check whether the event has a NIP-70 `-` tag. */
function isProtectedEvent(event: NostrEvent): boolean {
  return event.tags.some(([name]) => name === '-');
}

/** Hydrate the event with the user, if applicable. */
async function hydrateEvent(event: DittoEvent, signal: AbortSignal): Promise<void> {
  await hydrateEvents({ events: [event], relay: await Storages.db(), signal });
}

/** Maybe store the event, if eligible. */
async function storeEvent(event: NostrEvent, signal?: AbortSignal): Promise<undefined> {
  const store = await Storages.db();

  try {
    await store.transaction(async (store, kysely) => {
      if (!NKinds.ephemeral(event.kind)) {
        await updateStats({ event, store, kysely });
      }
      await store.event(event, { signal });
    });
  } catch (e) {
    // If the failure is only because of updateStats (which runs first), insert the event anyway.
    // We can't catch this in the transaction because the error aborts the transaction on the Postgres side.
    if (e instanceof Error && e.message.includes('event_stats' satisfies keyof DittoTables)) {
      await store.event(event, { signal });
    } else {
      throw e;
    }
  }
}

/** Parse kind 0 metadata and track indexes in the database. */
async function updateAuthorData(event: NostrEvent, signal: AbortSignal): Promise<void> {
  if (event.kind !== 0) return;

  // Parse metadata.
  const metadata = n.json().pipe(n.metadata()).catch({}).safeParse(event.content);
  if (!metadata.success) return;

  const { name, nip05 } = metadata.data;

  const kysely = await Storages.kysely();

  const updates: UpdateObject<DittoTables, 'author_stats'> = {};

  const authorStats = await kysely
    .selectFrom('author_stats')
    .selectAll()
    .where('pubkey', '=', event.pubkey)
    .executeTakeFirst();

  const lastVerified = authorStats?.nip05_last_verified_at;
  const eventNewer = !lastVerified || event.created_at > lastVerified;

  try {
    if (nip05 !== authorStats?.nip05 && eventNewer || !lastVerified) {
      if (nip05) {
        const tld = tldts.parse(nip05);
        if (tld.isIcann && !tld.isIp && !tld.isPrivate) {
          const pointer = await nip05Cache.fetch(nip05.toLowerCase(), { signal });
          if (pointer.pubkey === event.pubkey) {
            updates.nip05 = nip05;
            updates.nip05_domain = tld.domain;
            updates.nip05_hostname = tld.hostname;
            updates.nip05_last_verified_at = event.created_at;
          }
        }
      } else {
        updates.nip05 = null;
        updates.nip05_domain = null;
        updates.nip05_hostname = null;
        updates.nip05_last_verified_at = event.created_at;
      }
    }
  } catch {
    // Fallthrough.
  }

  // Fetch favicon.
  const domain = nip05?.split('@')[1].toLowerCase();
  if (domain) {
    try {
      await faviconCache.fetch(domain, { signal });
    } catch {
      // Fallthrough.
    }
  }

  const search = [name, nip05].filter(Boolean).join(' ').trim();

  if (search !== authorStats?.search) {
    updates.search = search;
  }

  if (Object.keys(updates).length) {
    await kysely.insertInto('author_stats')
      .values({
        pubkey: event.pubkey,
        followers_count: 0,
        following_count: 0,
        notes_count: 0,
        search,
        ...updates,
      })
      .onConflict((oc) => oc.column('pubkey').doUpdateSet(updates))
      .execute();
  }
}

async function prewarmLinkPreview(event: NostrEvent, signal: AbortSignal): Promise<void> {
  const { firstUrl } = parseNoteContent(stripimeta(event.content, event.tags), []);
  if (firstUrl) {
    await unfurlCardCached(firstUrl, signal);
  }
}

/** Determine if the event is being received in a timely manner. */
function isFresh(event: NostrEvent): boolean {
  return eventAge(event) < Time.minutes(1);
}

async function webPush(event: NostrEvent): Promise<void> {
  if (!isFresh(event)) {
    throw new RelayError('invalid', 'event too old');
  }

  const kysely = await Storages.kysely();
  const pubkeys = getTagSet(event.tags, 'p');

  if (!pubkeys.size) {
    return;
  }

  const rows = await kysely
    .selectFrom('push_subscriptions')
    .selectAll()
    .where('pubkey', 'in', [...pubkeys])
    .execute();

  for (const row of rows) {
    const viewerPubkey = row.pubkey;

    if (viewerPubkey === event.pubkey) {
      continue; // Don't notify authors about their own events.
    }

    const message = await renderWebPushNotification(event, viewerPubkey);
    if (!message) {
      continue;
    }

    const subscription = {
      endpoint: row.endpoint,
      keys: {
        auth: row.auth,
        p256dh: row.p256dh,
      },
    };

    await DittoPush.push(subscription, message);
    webPushNotificationsCounter.inc({ type: message.notification_type });
  }
}

async function generateSetEvents(event: NostrEvent): Promise<void> {
  const signer = Conf.signer;
  const pubkey = await signer.getPublicKey();

  const tagsAdmin = event.tags.some(([name, value]) => ['p', 'P'].includes(name) && value === pubkey);

  if (event.kind === 1984 && tagsAdmin) {
    const rel = await signer.signEvent({
      kind: 30383,
      content: '',
      tags: [
        ['d', event.id],
        ['p', event.pubkey],
        ['k', '1984'],
        ['n', 'open'],
        ...[...getTagSet(event.tags, 'p')].map((value) => ['P', value]),
        ...[...getTagSet(event.tags, 'e')].map((value) => ['e', value]),
      ],
      created_at: Math.floor(Date.now() / 1000),
    });

    await handleEvent(rel, { source: 'pipeline', signal: AbortSignal.timeout(1000) });
  }

  if (event.kind === 3036 && tagsAdmin) {
    const rel = await signer.signEvent({
      kind: 30383,
      content: '',
      tags: [
        ['d', event.id],
        ['p', event.pubkey],
        ['k', '3036'],
        ['n', 'pending'],
      ],
      created_at: Math.floor(Date.now() / 1000),
    });

    await handleEvent(rel, { source: 'pipeline', signal: AbortSignal.timeout(1000) });
  }
}

/** Stores the event in the 'event_zaps' table */
async function handleZaps(kysely: Kysely<DittoTables>, event: NostrEvent) {
  if (event.kind !== 9735) return;

  const zapRequestString = event?.tags?.find(([name]) => name === 'description')?.[1];
  if (!zapRequestString) return;
  const zapRequest = n.json().pipe(n.event()).optional().catch(undefined).parse(zapRequestString);
  if (!zapRequest) return;

  const amountSchema = z.coerce.number().int().nonnegative().catch(0);
  const amount_millisats = amountSchema.parse(getAmount(event?.tags.find(([name]) => name === 'bolt11')?.[1]));
  if (!amount_millisats || amount_millisats < 1) return;

  const zappedEventId = zapRequest.tags.find(([name]) => name === 'e')?.[1];
  if (!zappedEventId) return;

  try {
    await kysely.insertInto('event_zaps').values({
      receipt_id: event.id,
      target_event_id: zappedEventId,
      sender_pubkey: zapRequest.pubkey,
      amount_millisats,
      comment: zapRequest.content,
    }).execute();
  } catch {
    // receipt_id is unique, do nothing
  }
}

export { handleEvent, handleZaps, updateAuthorData };
