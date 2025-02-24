import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely';

import type { DittoDB } from '../DittoDB.ts';
import type { DittoTables } from '../DittoTables.ts';

export class DummyDB implements DittoDB {
  readonly kysely: Kysely<DittoTables>;
  readonly poolSize = 0;
  readonly availableConnections = 0;

  constructor() {
    this.kysely = new Kysely<DittoTables>({
      dialect: {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (db) => new PostgresIntrospector(db),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      },
    });
  }

  listen(): void {
    // noop
  }

  migrate(): Promise<void> {
    return Promise.resolve();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve();
  }
}
