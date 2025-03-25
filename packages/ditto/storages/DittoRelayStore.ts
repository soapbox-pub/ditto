import { DittoConf } from '@ditto/conf';
import { DittoDB, DittoTables } from '@ditto/db';
import {
  activeAuthorSubscriptionsGauge,
  cachedFaviconsSizeGauge,
  cachedNip05sSizeGauge,
  pipelineEventsCounter,
  policyEventsCounter,
  webPushNotificationsCounter,
} from '@ditto/metrics';
import {
  NKinds,
  NostrEvent,
  NostrFilter,
  NostrRelayCLOSED,
  NostrRelayCOUNT,
  NostrRelayEOSE,
  NostrRelayEVENT,
  NRelay,
  NSchema as n,
} from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { logi } from '@soapbox/logi';
import { UpdateObject } from 'kysely';
import { LRUCache } from 'lru-cache';
import tldts from 'tldts';
import { z } from 'zod';

import { DittoPush } from '@/DittoPush.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { RelayError } from '@/RelayError.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { eventAge, isNostrId, nostrNow, Time } from '@/utils.ts';
import { getAmount } from '@/utils/bolt11.ts';
import { errorJson } from '@/utils/log.ts';
import { purifyEvent } from '@/utils/purify.ts';
import { getTagSet } from '@/utils/tags.ts';
import { PolicyWorker } from '@/workers/policy.ts';
import { verifyEventWorker } from '@/workers/verify.ts';
import { fetchFavicon, insertFavicon, queryFavicon } from '@/utils/favicon.ts';
import { lookupNip05 } from '@/utils/nip05.ts';
import { getCardUrl } from '@/utils/note.ts';
import { SimpleLRU } from '@/utils/SimpleLRU.ts';
import { unfurlCard } from '@/utils/unfurl.ts';
import { renderWebPushNotification } from '@/views/mastodon/push.ts';

interface DittoRelayStoreOpts {
  db: DittoDB;
  conf: DittoConf;
  pool: NRelay;
  relay: NRelay;
  fetch?: typeof fetch;
}

/** Backing storage class for Ditto relay implementation at `/relay`. */
export class DittoRelayStore implements NRelay {
  private push: DittoPush;
  private encounters = new LRUCache<string, true>({ max: 5000 });
  private authorEncounters = new LRUCache<string, true>({ max: 5000, ttl: Time.hours(4) });
  private controller = new AbortController();
  private policyWorker: PolicyWorker;

  private faviconCache: SimpleLRU<string, URL>;
  private nip05Cache: SimpleLRU<string, nip19.ProfilePointer>;

  private ns = 'ditto.relay.store';

  constructor(private opts: DittoRelayStoreOpts) {
    const { conf, db } = this.opts;

    this.push = new DittoPush(opts);
    this.policyWorker = new PolicyWorker(conf);

    this.faviconCache = new SimpleLRU<string, URL>(
      async (domain, { signal }) => {
        const row = await queryFavicon(db.kysely, domain);

        if (row && (nostrNow() - row.last_updated_at) < (conf.caches.favicon.ttl / 1000)) {
          return new URL(row.favicon);
        }

        const url = await fetchFavicon(domain, signal);
        await insertFavicon(db.kysely, domain, url.href);
        return url;
      },
      { ...conf.caches.favicon, gauge: cachedFaviconsSizeGauge },
    );

    this.nip05Cache = new SimpleLRU<string, nip19.ProfilePointer>(
      (nip05, { signal }) => {
        return lookupNip05(nip05, { ...this.opts, signal });
      },
      { ...conf.caches.nip05, gauge: cachedNip05sSizeGauge },
    );

    this.listen().catch((e: unknown) => {
      if (e instanceof Error && e.name === 'AbortError') {
        return; // `this.close()` was called. This is expected.
      }

      throw e;
    });
  }

  /** Open a firehose to the relay. */
  private async listen(): Promise<void> {
    const { relay } = this.opts;
    const { signal } = this.controller; // this controller only aborts when `this.close()` is called

    for await (const msg of relay.req([{ limit: 0 }], { signal })) {
      if (msg[0] === 'EVENT') {
        const [, , event] = msg;
        const { id, kind } = event;
        try {
          await this.event(event, { signal });
        } catch (e) {
          logi({ level: 'error', ns: this.ns, id, kind, source: 'listen', error: errorJson(e) });
        }
      }
    }
  }

  req(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    const { relay } = this.opts;
    return relay.req(filters, opts);
  }

  /**
   * Common pipeline function to process (and maybe store) events.
   * It is idempotent, so it can be called multiple times for the same event.
   */
  async event(event: DittoEvent, opts: { signal?: AbortSignal } = {}): Promise<void> {
    const { conf, relay, pool } = this.opts;
    const { signal } = opts;

    // Skip events that have already been encountered.
    if (this.encounters.get(event.id)) {
      return; // NIP-01: duplicate events should have ok `true`
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
    if (NKinds.ephemeral(event.kind) && !this.isFresh(event)) {
      throw new RelayError('invalid', 'event too old');
    }
    // Block NIP-70 events, because we have no way to `AUTH`.
    if (event.tags.some(([name]) => name === '-')) {
      throw new RelayError('invalid', 'protected event');
    }
    // Validate the event's signature.
    if (!(await verifyEventWorker(event))) {
      throw new RelayError('invalid', 'invalid signature');
    }
    // Recheck encountered after async ops.
    if (this.encounters.has(event.id)) {
      return;
    }
    // Set the event as encountered after verifying the signature.
    this.encounters.set(event.id, true);

    // Log the event.
    logi({ level: 'debug', ns: 'ditto.event', source: 'pipeline', id: event.id, kind: event.kind });
    pipelineEventsCounter.inc({ kind: event.kind });

    // NIP-46 events get special treatment.
    // They are exempt from policies and other side-effects, and should be streamed out immediately.
    // If streaming fails, an error should be returned.
    if (event.kind === 24133) {
      await relay.event(event, { signal });
    }

    // Prepare the event for additional checks.
    // FIXME: This is kind of hacky. Should be reorganized to fetch only what's needed for each stage.
    await this.hydrateEvent(event, signal);

    // Try to fetch a kind 0 for the user if we don't have one yet.
    // TODO: Create a more elaborate system to refresh all replaceable events by addr.
    if (event.kind !== 0 && !event.author?.sig && !this.authorEncounters.get(event.pubkey)) {
      activeAuthorSubscriptionsGauge.inc();
      this.authorEncounters.set(event.pubkey, true);

      const [author] = await pool.query(
        [{ kinds: [0], authors: [event.pubkey], limit: 1 }],
        { signal: AbortSignal.timeout(1000) },
      );

      if (author) {
        // await because it's important to have the kind 0 before the policy filter.
        await this.event(author, { signal });
      }
      activeAuthorSubscriptionsGauge.dec();
    }

    // Ensure the event doesn't violate the policy.
    if (event.pubkey !== await conf.signer.getPublicKey()) {
      await this.policyFilter(purifyEvent(event), signal);
    }

    // Ensure that the author is not banned.
    const n = getTagSet(event.user?.tags ?? [], 'n');
    if (n.has('disabled')) {
      throw new RelayError('blocked', 'author is blocked');
    }

    try {
      await this.handleRevokeNip05(event, signal);
      await relay.event(purifyEvent(event), { signal });
    } finally {
      // This needs to run in steps, and should not block the API from responding.
      const signal = AbortSignal.timeout(5000);
      Promise.allSettled([
        this.handleZaps(event),
        this.updateAuthorData(event, signal),
        this.generateLinkPreview(event, signal),
        this.generateSetEvents(event),
      ])
        .then(() =>
          Promise.allSettled([
            this.webPush(event),
            this.fetchRelated(event),
          ])
        )
        .catch(() => {});
    }
  }

  private async policyFilter(event: NostrEvent, signal?: AbortSignal): Promise<void> {
    try {
      const result = await this.policyWorker.call(event, signal);
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

  /** Stores the event in the 'event_zaps' table */
  private async handleZaps(event: NostrEvent) {
    if (event.kind !== 9735) return;

    const { db } = this.opts;

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
      await db.kysely.insertInto('event_zaps').values({
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

  /** Sets the nip05 column to null if the event is a revocation of a nip05 */
  private async handleRevokeNip05(event: NostrEvent, signal?: AbortSignal): Promise<void> {
    const { conf, relay, db } = this.opts;

    if (event.kind !== 5 || await conf.signer.getPublicKey() !== event.pubkey) {
      return;
    }

    if (!event.tags.some(([name, value]) => name === 'k' && value === '30360')) {
      return;
    }

    const eventId = event.tags.find(([name]) => name === 'e')?.[1];
    if (!eventId || !isNostrId(eventId)) {
      return;
    }

    const [grant] = await relay.query([{ kinds: [30360], ids: [eventId] }], { signal });
    if (!grant) {
      return;
    }

    const authorId = grant.tags.find(([name]) => name === 'p')?.[1];
    if (!authorId || !isNostrId(authorId)) {
      return;
    }

    await db.kysely.updateTable('author_stats').set({
      nip05: null,
      nip05_domain: null,
      nip05_hostname: null,
      nip05_last_verified_at: null,
    }).where('pubkey', '=', authorId)
      .execute();
  }

  /** Parse kind 0 metadata and track indexes in the database. */
  async updateAuthorData(event: NostrEvent, signal?: AbortSignal): Promise<void> {
    if (event.kind !== 0) return;

    const { db } = this.opts;

    // Parse metadata.
    const metadata = n.json().pipe(n.metadata()).catch({}).safeParse(event.content);
    if (!metadata.success) return;

    const { name, nip05 } = metadata.data;

    const updates: UpdateObject<DittoTables, 'author_stats'> = {};

    const authorStats = await db.kysely
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
            const pointer = await this.nip05Cache.fetch(nip05, { signal });
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
        await this.faviconCache.fetch(domain, { signal });
      } catch {
        // Fallthrough.
      }
    }

    const search = [name, nip05].filter(Boolean).join(' ').trim();

    if (search !== authorStats?.search) {
      updates.search = search;
    }

    if (Object.keys(updates).length) {
      await db.kysely.insertInto('author_stats')
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

  private async fetchRelated(event: NostrEvent): Promise<void> {
    const ids = new Set<string>();

    for (const tag of event.tags) {
      const [name, value] = tag;

      if ((name === 'e' || name === 'q') && isNostrId(value) && !this.encounters.has(value)) {
        ids.add(value);
      }
    }

    const { db, pool } = this.opts;

    if (ids.size) {
      const query = db.kysely
        .selectFrom('nostr_events')
        .select('id')
        .where('id', 'in', [...ids]);

      for (const row of await query.execute().catch(() => [])) {
        ids.delete(row.id);
      }
    }

    if (ids.size) {
      const signal = AbortSignal.timeout(1000);

      for (const event of await pool.query([{ ids: [...ids] }], { signal }).catch(() => [])) {
        await this.event(event).catch(() => {});
      }
    }
  }

  private async generateLinkPreview(event: NostrEvent, signal?: AbortSignal): Promise<void> {
    const { db, conf } = this.opts;

    if (event.kind === 1) {
      const cardUrl = getCardUrl(event);

      if (cardUrl) {
        const linkPreview = await unfurlCard(cardUrl, { conf, signal });

        if (linkPreview) {
          await db.kysely.insertInto('event_stats')
            .values({
              event_id: event.id,
              replies_count: 0,
              reposts_count: 0,
              reactions_count: 0,
              quotes_count: 0,
              reactions: '{}',
              zaps_amount: 0,
              zaps_amount_cashu: 0,
              link_preview: linkPreview,
            })
            .onConflict((oc) => oc.column('event_id').doUpdateSet({ link_preview: linkPreview }))
            .execute();
        }
      }
    }
  }

  private async generateSetEvents(event: NostrEvent): Promise<void> {
    const { conf } = this.opts;

    const signer = conf.signer;
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

      await this.event(rel, { signal: AbortSignal.timeout(1000) });
    }

    if (event.kind === 3036 && tagsAdmin) {
      const r = event.tags.find(([name]) => name === 'r')?.[1];

      if (r) {
        const rel = await signer.signEvent({
          kind: 30383,
          content: '',
          tags: [
            ['d', event.id],
            ['p', event.pubkey],
            ['k', '3036'],
            ['r', r.toLowerCase()],
            ['n', 'pending'],
          ],
          created_at: Math.floor(Date.now() / 1000),
        });

        await this.event(rel, { signal: AbortSignal.timeout(1000) });
      }
    }
  }

  private async webPush(event: NostrEvent): Promise<void> {
    if (!this.isFresh(event)) {
      throw new RelayError('invalid', 'event too old');
    }

    const { db, relay } = this.opts;
    const pubkeys = getTagSet(event.tags, 'p');

    if (!pubkeys.size) {
      return;
    }

    const rows = await db.kysely
      .selectFrom('push_subscriptions')
      .selectAll()
      .where('pubkey', 'in', [...pubkeys])
      .execute();

    for (const row of rows) {
      const viewerPubkey = row.pubkey;

      if (viewerPubkey === event.pubkey) {
        continue; // Don't notify authors about their own events.
      }

      const message = await renderWebPushNotification(relay, event, viewerPubkey);
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

      await this.push.push(subscription, message);
      webPushNotificationsCounter.inc({ type: message.notification_type });
    }
  }

  /** Hydrate the event with the user, if applicable. */
  private async hydrateEvent(event: NostrEvent, signal?: AbortSignal): Promise<DittoEvent> {
    const [hydrated] = await hydrateEvents({ ...this.opts, events: [event], signal });
    return hydrated;
  }

  /** Determine if the event is being received in a timely manner. */
  private isFresh(event: NostrEvent): boolean {
    return eventAge(event) < Time.minutes(1);
  }

  async query(filters: NostrFilter[], opts: { pure?: boolean; signal?: AbortSignal } = {}): Promise<DittoEvent[]> {
    const { relay } = this.opts;
    const { pure = true, signal } = opts; // TODO: make pure `false` by default

    const events = await relay.query(filters, opts);

    if (!pure) {
      return hydrateEvents({ ...this.opts, events, signal });
    }

    return events;
  }

  count(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrRelayCOUNT[2]> {
    const { relay } = this.opts;
    if (!relay.count) {
      return Promise.reject(new Error('Method not implemented.'));
    }
    return relay.count(filters, opts);
  }

  remove(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<void> {
    const { relay } = this.opts;
    if (!relay.remove) {
      return Promise.reject(new Error('Method not implemented.'));
    }
    return relay.remove(filters, opts);
  }

  async close(): Promise<void> {
    const { relay } = this.opts;

    this.controller.abort();

    await relay.close();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
