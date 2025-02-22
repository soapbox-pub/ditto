// deno-lint-ignore-file require-await
import { type DittoDB, DittoPolyPg } from '@ditto/db';
import { NPool, NRelay1 } from '@nostrify/nostrify';

import { Conf } from '@/config.ts';
import { DittoPgStore } from '@/storages/DittoPgStore.ts';
import { seedZapSplits } from '@/utils/zap-split.ts';
import { DittoPool } from '@/storages/DittoPool.ts';

export class Storages {
  private static _db: Promise<DittoPgStore> | undefined;
  private static _database: Promise<DittoDB> | undefined;
  private static _client: Promise<NPool<NRelay1>> | undefined;

  public static async database(): Promise<DittoDB> {
    if (!this._database) {
      this._database = (async () => {
        const db = DittoPolyPg.create(Conf.databaseUrl, {
          poolSize: Conf.pg.poolSize,
          debug: Conf.pgliteDebug,
        });
        await DittoPolyPg.migrate(db.kysely);
        return db;
      })();
    }
    return this._database;
  }

  public static async kysely(): Promise<DittoDB['kysely']> {
    const { kysely } = await this.database();
    return kysely;
  }

  /** SQL database to store events this Ditto server cares about. */
  public static async db(): Promise<DittoPgStore> {
    if (!this._db) {
      this._db = (async () => {
        const db = await this.database();
        const store = new DittoPgStore({
          db,
          pubkey: await Conf.signer.getPublicKey(),
          timeout: Conf.db.timeouts.default,
          notify: Conf.notifyEnabled,
        });
        await seedZapSplits(store);
        return store;
      })();
    }
    return this._db;
  }

  /** Relay pool storage. */
  public static async client(): Promise<NPool<NRelay1>> {
    if (!this._client) {
      this._client = (async () => {
        const relay = await this.db();
        return new DittoPool({ conf: Conf, relay });
      })();
    }
    return this._client;
  }
}
