import {
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  Kysely,
  type QueryCompiler,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from '../deps.ts';

import { DenoSqliteDriver } from './deno-sqlite-driver.ts';

import type { DenoSqliteDialectConfig } from './deno-sqlite-dialect-config.ts';

class DenoSqliteDialect implements Dialect {
  readonly #config: DenoSqliteDialectConfig;

  constructor(config: DenoSqliteDialectConfig) {
    this.#config = Object.freeze({ ...config });
  }

  createDriver(): Driver {
    return new DenoSqliteDriver(this.#config);
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return new SqliteAdapter();
  }

  createIntrospector(db: Kysely<any>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }
}

export { DenoSqliteDialect };
