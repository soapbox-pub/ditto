import { DittoConf } from '@ditto/conf';
import { pipelineEventsCounter } from '@ditto/metrics';
import {
  NKinds,
  NostrEvent,
  NostrFilter,
  NostrRelayCLOSED,
  NostrRelayCOUNT,
  NostrRelayEOSE,
  NostrRelayEVENT,
  NRelay,
} from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';
import { LRUCache } from 'lru-cache';

import { RelayError } from '@/RelayError.ts';
import { eventAge, Time } from '@/utils.ts';
import { purifyEvent } from '@/utils/purify.ts';
import { getTagSet } from '@/utils/tags.ts';
import { verifyEventWorker } from '@/workers/verify.ts';

interface DittoAPIStoreOpts {
  conf: DittoConf;
  pool: NRelay;
  relay: NRelay;
}

export class DittoAPIStore implements NRelay {
  private encounters = new LRUCache<string, true>({ max: 5000 });

  constructor(private opts: DittoAPIStoreOpts) {}

  req(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    const { relay } = this.opts;
    return relay.req(filters, opts);
  }

  async event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void> {
    const { relay, pool } = this.opts;

    await relay.event(event, opts);

    (async () => {
      try {
        await pool.event(event, opts);
      } catch (e) {
        console.error(e);
      }
    })();
  }

  /**
   * Common pipeline function to process (and maybe store) events.
   * It is idempotent, so it can be called multiple times for the same event.
   */
  async handleEvent(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void> {
    const { conf, relay } = this.opts;
    const { signal } = opts;

    // Skip events that have already been encountered.
    if (this.encounters.get(event.id)) {
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
    if (NKinds.ephemeral(event.kind) && !this.isFresh(event)) {
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
    if (this.encounters.has(event.id)) {
      throw new RelayError('duplicate', 'already have this event');
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

    // Ensure the event doesn't violate the policy.
    if (event.pubkey !== await conf.signer.getPublicKey()) {
      await this.policyFilter(event, signal);
    }

    // Prepare the event for additional checks.
    // FIXME: This is kind of hacky. Should be reorganized to fetch only what's needed for each stage.
    await hydrateEvent(event, signal);

    // Ensure that the author is not banned.
    const n = getTagSet(event.user?.tags ?? [], 'n');
    if (n.has('disabled')) {
      throw new RelayError('blocked', 'author is blocked');
    }

    const kysely = await Storages.kysely();

    try {
      await this.storeEvent(purifyEvent(event), signal);
    } finally {
      // This needs to run in steps, and should not block the API from responding.
      Promise.allSettled([
        this.handleZaps(kysely, event),
        this.updateAuthorData(event, signal),
        this.prewarmLinkPreview(event, signal),
        this.generateSetEvents(event),
      ])
        .then(() => this.webPush(event))
        .catch(() => {});
    }
  }

  /** Determine if the event is being received in a timely manner. */
  private isFresh(event: NostrEvent): boolean {
    return eventAge(event) < Time.minutes(1);
  }

  query(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrEvent[]> {
    const { relay } = this.opts;
    return relay.query(filters, opts);
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

  close(): Promise<void> {
    return Promise.reject(new Error('Method not implemented.'));
  }
}
