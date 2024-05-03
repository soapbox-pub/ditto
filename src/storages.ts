import { NCache } from '@nostrify/nostrify';
import { Conf } from '@/config.ts';
import { db } from '@/db.ts';
import { activeRelays, pool } from '@/pool.ts';
import { EventsDB } from '@/storages/events-db.ts';
import { Optimizer } from '@/storages/optimizer.ts';
import { PoolStore } from '@/storages/pool-store.ts';
import { Reqmeister } from '@/storages/reqmeister.ts';
import { SearchStore } from '@/storages/search-store.ts';
import { InternalRelay } from '@/storages/InternalRelay.ts';
import { UserStore } from '@/storages/UserStore.ts';
import { Time } from '@/utils/time.ts';

export class Storages {
  private static _db: EventsDB | undefined;
  private static _admin: UserStore | undefined;
  private static _cache: NCache | undefined;
  private static _client: PoolStore | undefined;
  private static _optimizer: Optimizer | undefined;
  private static _reqmeister: Reqmeister | undefined;
  private static _pubsub: InternalRelay | undefined;
  private static _search: SearchStore | undefined;

  /** SQLite database to store events this Ditto server cares about. */
  public static get db(): EventsDB {
    if (!this._db) {
      this._db = new EventsDB(db);
    }
    return this._db;
  }

  /** Admin user storage. */
  public static get admin(): UserStore {
    if (!this._admin) {
      this._admin = new UserStore(Conf.pubkey, this.db);
    }
    return this._admin;
  }

  /** Internal pubsub relay between controllers and the pipeline. */
  public static get pubsub(): InternalRelay {
    if (!this._pubsub) {
      this._pubsub = new InternalRelay();
    }
    return this._pubsub;
  }

  /** Relay pool storage. */
  public static get client(): PoolStore {
    if (!this._client) {
      this._client = new PoolStore({
        pool,
        relays: activeRelays,
      });
    }
    return this._client;
  }

  /** In-memory data store for cached events. */
  public static get cache(): NCache {
    if (!this._cache) {
      this._cache = new NCache({ max: 3000 });
    }
    return this._cache;
  }

  /** Batches requests for single events. */
  public static get reqmeister(): Reqmeister {
    if (!this._reqmeister) {
      this._reqmeister = new Reqmeister({
        client: this.client,
        delay: Time.seconds(1),
        timeout: Time.seconds(1),
      });
    }
    return this._reqmeister;
  }

  /** Main Ditto storage adapter */
  public static get optimizer(): Optimizer {
    if (!this._optimizer) {
      this._optimizer = new Optimizer({
        db: this.db,
        cache: this.cache,
        client: this.reqmeister,
      });
    }
    return this._optimizer;
  }

  /** Storage to use for remote search. */
  public static get search(): SearchStore {
    if (!this._search) {
      this._search = new SearchStore({
        relay: Conf.searchRelay,
        fallback: this.optimizer,
      });
    }
    return this._search;
  }
}
