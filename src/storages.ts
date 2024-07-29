// deno-lint-ignore-file require-await
import { Conf } from '@/config.ts';
import { DittoDB } from '@/db/DittoDB.ts';
import { AdminStore } from '@/storages/AdminStore.ts';
import { EventsDB } from '@/storages/EventsDB.ts';
import { SearchStore } from '@/storages/search-store.ts';
import { InternalRelay } from '@/storages/InternalRelay.ts';
import { NPool, NRelay1 } from '@nostrify/nostrify';
import { getRelays } from '@/utils/outbox.ts';
import { seedZapSplits } from '@/utils/zap-split.ts';

export class Storages {
  private static _db: Promise<EventsDB> | undefined;
  private static _admin: Promise<AdminStore> | undefined;
  private static _client: Promise<NPool> | undefined;
  private static _pubsub: Promise<InternalRelay> | undefined;
  private static _search: Promise<SearchStore> | undefined;

  /** SQLite database to store events this Ditto server cares about. */
  public static async db(): Promise<EventsDB> {
    if (!this._db) {
      this._db = (async () => {
        const kysely = await DittoDB.getInstance();
        const store = new EventsDB(kysely);
        await seedZapSplits(store);
        return store;
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
  public static async client(): Promise<NPool> {
    if (!this._client) {
      this._client = (async () => {
        const db = await this.db();

        const [relayList] = await db.query([
          { kinds: [10002], authors: [Conf.pubkey], limit: 1 },
        ]);

        const tags = relayList?.tags ?? [];

        const activeRelays = tags.reduce((acc, [name, url, marker]) => {
          if (name === 'r' && (!marker || marker === 'write')) {
            acc.push(url);
          }
          return acc;
        }, []);

        console.log(`pool: connecting to ${activeRelays.length} relays.`);

        return new NPool({
          open(url) {
            return new NRelay1(url, {
              // Skip event verification (it's done in the pipeline).
              verifyEvent: () => true,
            });
          },
          reqRouter: async (filters) => {
            return new Map(activeRelays.map((relay) => {
              return [relay, filters];
            }));
          },
          eventRouter: async (event) => {
            const relaySet = await getRelays(await Storages.db(), event.pubkey);
            relaySet.delete(Conf.relay);

            const relays = [...relaySet].slice(0, 4);
            return relays;
          },
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
