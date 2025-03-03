import { type Kysely, sql } from 'kysely';

import type { DittoDB } from '../DittoDB.ts';
import type { DittoTables } from '../DittoTables.ts';

/** Wraps another DittoDB implementation to clear all data when disposed. */
export class TestDB implements DittoDB {
  constructor(private db: DittoDB) {}

  get kysely(): Kysely<DittoTables> {
    return this.db.kysely;
  }

  get poolSize(): number {
    return this.db.poolSize;
  }

  get availableConnections(): number {
    return this.db.availableConnections;
  }

  migrate(): Promise<void> {
    return this.db.migrate();
  }

  listen(channel: string, callback: (payload: string) => void): void {
    return this.db.listen(channel, callback);
  }

  /** Truncate all tables. */
  async clear(): Promise<void> {
    const query = sql<{ tablename: string }>`select tablename from pg_tables where schemaname = current_schema()`;

    const { rows } = await query.execute(this.db.kysely);

    for (const { tablename } of rows) {
      if (tablename.startsWith('kysely_')) {
        continue; // Skip Kysely's internal tables
      } else {
        await sql`truncate table ${sql.ref(tablename)} cascade`.execute(this.db.kysely);
      }
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.clear();
    await this.db[Symbol.asyncDispose]();
  }
}
