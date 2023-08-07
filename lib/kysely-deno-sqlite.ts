import {
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  Kysely,
  type QueryCompiler,
  SqliteAdapter,
  type SqliteDatabase,
  type SqliteDialectConfig,
  SqliteDriver,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type SqliteStatement,
} from 'npm:kysely@^0.25.0';

import type { DB as DenoSqlite } from 'https://deno.land/x/sqlite@v3.7.3/mod.ts';

class DenoSqliteDatabase implements SqliteDatabase {
  #db: DenoSqlite;

  constructor(db: DenoSqlite) {
    this.#db = db;
  }

  close(): void {
    this.#db.close();
  }

  prepare(sql: string): SqliteStatement {
    return {
      reader: true,
      all: (parameters: ReadonlyArray<unknown>) => {
        console.log(sql);
        return this.#db.query(sql, parameters as any);
      },
      run: (parameters: ReadonlyArray<unknown>) => {
        this.#db.query(sql, parameters as any);
        return {
          changes: this.#db.changes,
          lastInsertRowid: this.#db.lastInsertRowId,
        };
      },
    };
  }
}

interface DenoSqliteDialectConfig extends Omit<SqliteDialectConfig, 'database'> {
  database: DenoSqlite | (() => Promise<DenoSqlite>);
}

class DenoSqliteDriver extends SqliteDriver {
  constructor(config: DenoSqliteDialectConfig) {
    super({
      ...config,
      database: async () =>
        new DenoSqliteDatabase(
          typeof config.database === 'function' ? await config.database() : config.database,
        ),
    });
  }
}

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

export { DenoSqliteDatabase, DenoSqliteDialect, type DenoSqliteDialectConfig, DenoSqliteDriver };
