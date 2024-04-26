import { NCache } from '@nostrify/nostrify';
import { Conf } from '@/config.ts';
import { db } from '@/db.ts';
import * as pipeline from '@/pipeline.ts';
import { activeRelays, pool } from '@/pool.ts';
import { EventsDB } from '@/storages/events-db.ts';
import { Optimizer } from '@/storages/optimizer.ts';
import { PoolStore } from '@/storages/pool-store.ts';
import { Reqmeister } from '@/storages/reqmeister.ts';
import { SearchStore } from '@/storages/search-store.ts';
import { InternalRelay } from '@/storages/InternalRelay.ts';
import { Time } from '@/utils/time.ts';

/** Relay pool storage. */
const client = new PoolStore({
  pool,
  relays: activeRelays,
  publisher: pipeline,
});

/** SQLite database to store events this Ditto server cares about. */
const eventsDB = new EventsDB(db);

/** In-memory data store for cached events. */
const cache = new NCache({ max: 3000 });

/** Batches requests for single events. */
const reqmeister = new Reqmeister({
  client,
  delay: Time.seconds(1),
  timeout: Time.seconds(1),
});

/** Main Ditto storage adapter */
const optimizer = new Optimizer({
  db: eventsDB,
  cache,
  client: reqmeister,
});

/** Storage to use for remote search. */
const searchStore = new SearchStore({
  relay: Conf.searchRelay,
  fallback: optimizer,
});

export class Storages {
  private static _pubsub: InternalRelay | undefined;

  static get pubsub(): InternalRelay {
    if (!this._pubsub) {
      this._pubsub = new InternalRelay();
    }

    return this._pubsub;
  }
}

export { cache, client, eventsDB, optimizer, reqmeister, searchStore };
