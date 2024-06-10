// deno-lint-ignore-file require-await
import { RelayPoolWorker } from 'nostr-relaypool';

import { Conf } from '@/config.ts';
import { DittoDB } from '@/db/DittoDB.ts';
import { AdminStore } from '@/storages/AdminStore.ts';
import { EventsDB } from '@/storages/EventsDB.ts';
import { PoolStore } from '@/storages/pool-store.ts';
import { SearchStore } from '@/storages/search-store.ts';
import { InternalRelay } from '@/storages/InternalRelay.ts';

export class Storages {
  private static _db: Promise<EventsDB> | undefined;
  private static _admin: Promise<AdminStore> | undefined;
  private static _client: Promise<PoolStore> | undefined;
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
  public static async admin(): Promise<AdminStore> {
    if (!this._admin) {
      this._admin = Promise.resolve(new AdminStore(await this.db()));
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

  /** Storage to use for remote search. */
  public static async search(): Promise<SearchStore> {
    if (!this._search) {
      this._search = Promise.resolve(
        new SearchStore({
          relay: Conf.searchRelay,
          fallback: await this.db(),
        }),
      );
    }
    return this._search;
  }
}
