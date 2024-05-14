// deno-lint-ignore-file require-await
import { NCache } from '@nostrify/nostrify';

import { Conf } from '@/config.ts';
import { DittoDB } from '@/db/DittoDB.ts';
import { EventsDB } from '@/storages/events-db.ts';
import { Optimizer } from '@/storages/optimizer.ts';
import { PoolStore } from '@/storages/pool-store.ts';
import { Reqmeister } from '@/storages/reqmeister.ts';
import { SearchStore } from '@/storages/search-store.ts';
import { InternalRelay } from '@/storages/InternalRelay.ts';
import { UserStore } from '@/storages/UserStore.ts';
import { Time } from '@/utils/time.ts';

export class Storages {
  private static _db: Promise<EventsDB> | undefined;
  private static _admin: Promise<UserStore> | undefined;
  private static _cache: Promise<NCache> | undefined;
  private static _client: Promise<PoolStore> | undefined;
  private static _optimizer: Promise<Optimizer> | undefined;
  private static _reqmeister: Promise<Reqmeister> | undefined;
  private static _pubsub: Promise<InternalRelay> | undefined;
  private static _search: Promise<SearchStore> | undefined;

  /** SQLite database to store events this Ditto server cares about. */
  public static async db(): Promise<EventsDB> {
    if (!this._db) {
      this._db = (async () => {
        const kysely = await DittoDB.getInstance();
        return new EventsDB(kysely);
      })();
    }
    return this._db;
  }

  /** Admin user storage. */
  public static async admin(): Promise<UserStore> {
    if (!this._admin) {
      this._admin = Promise.resolve(new UserStore(Conf.pubkey, await this.db()));
    }
    return this._admin;
  }

  /** Internal pubsub relay between controllers and the pipeline. */
  public static async pubsub(): Promise<InternalRelay> {
    if (!this._pubsub) {
      this._pubsub = Promise.resolve(new InternalRelay());
    }
    return this._pubsub;
  }

  /** Relay pool storage. */
  public static async client(): Promise<PoolStore> {
    if (!this._client) {
      this._client = (async () => {
        const db = await this.db();

        const [relayList] = await db.query([
          { kinds: [10002], authors: [Conf.pubkey], limit: 1 },
        ]);

        const tags = relayList?.tags ?? [];

        const activeRelays = tags.reduce((acc, [name, url, marker]) => {
          if (name === 'r' && !marker) {
            acc.push(url);
          }
          return acc;
        }, []);

        console.log(`pool: connecting to ${activeRelays.length} relays.`);

        const worker = new Worker('https://unpkg.com/nostr-relaypool2@0.6.34/lib/nostr-relaypool.worker.js', {
          type: 'module',
        });

        // @ts-ignore Wrong types.
        const pool = new RelayPoolWorker(worker, activeRelays, {
          autoReconnect: true,
          // The pipeline verifies events.
          skipVerification: true,
          // The logging feature overwhelms the CPU and creates too many logs.
          logErrorsAndNotices: false,
        });

        return new PoolStore({
          pool,
          relays: activeRelays,
        });
      })();
    }
    return this._client;
  }

  /** In-memory data store for cached events. */
  public static async cache(): Promise<NCache> {
    if (!this._cache) {
      this._cache = Promise.resolve(new NCache({ max: 3000 }));
    }
    return this._cache;
  }

  /** Batches requests for single events. */
  public static async reqmeister(): Promise<Reqmeister> {
    if (!this._reqmeister) {
      this._reqmeister = Promise.resolve(
        new Reqmeister({
          client: await this.client(),
          delay: Time.seconds(1),
          timeout: Time.seconds(1),
        }),
      );
    }
    return this._reqmeister;
  }

  /** Main Ditto storage adapter */
  public static async optimizer(): Promise<Optimizer> {
    if (!this._optimizer) {
      this._optimizer = Promise.resolve(
        new Optimizer({
          db: await this.db(),
          cache: await this.cache(),
          client: await this.reqmeister(),
        }),
      );
    }
    return this._optimizer;
  }

  /** Storage to use for remote search. */
  public static async search(): Promise<SearchStore> {
    if (!this._search) {
      this._search = Promise.resolve(
        new SearchStore({
          relay: Conf.searchRelay,
          fallback: await this.optimizer(),
        }),
      );
    }
    return this._search;
  }
}
