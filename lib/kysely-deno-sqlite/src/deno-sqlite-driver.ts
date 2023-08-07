import { type DenoSqlite, type SqliteDatabase, SqliteDriver, type SqliteStatement } from '../deps.ts';

import type { DenoSqliteDialectConfig } from './deno-sqlite-dialect-config.ts';

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

/** HACK: This is an adapter class. */
class DenoSqliteDatabase implements SqliteDatabase {
  #db: DenoSqlite;

  constructor(db: DenoSqlite) {
    this.#db = db;
  }

  close(): void {
    this.#db.close();
  }

  prepare(sql: string): SqliteStatement {
    const query = this.#db.prepareQuery(sql);
    return {
      // HACK: implement an actual driver to fix this.
      reader: true,
      all: (parameters: ReadonlyArray<unknown>) => {
        const result = query.allEntries(parameters as any);
        query.finalize();
        return result;
      },
      run: (parameters: ReadonlyArray<unknown>) => {
        query.execute(parameters as any);
        query.finalize();
        return {
          changes: this.#db.changes,
          lastInsertRowid: this.#db.lastInsertRowId,
        };
      },
    };
  }
}

export { DenoSqliteDriver };
