import { CompiledQuery, type DatabaseConnection, type DenoSqlite, type Driver, type QueryResult } from '../deps.ts';

import type { DenoSqliteDialectConfig } from './deno-sqlite-dialect-config.ts';

class DenoSqliteDriver implements Driver {
  readonly #config: DenoSqliteDialectConfig;
  readonly #connectionMutex = new ConnectionMutex();

  #db?: DenoSqlite;
  #connection?: DatabaseConnection;

  constructor(config: DenoSqliteDialectConfig) {
    this.#config = Object.freeze({ ...config });
  }

  async init(): Promise<void> {
    this.#db = typeof this.#config.database === 'function' ? await this.#config.database() : this.#config.database;

    this.#connection = new DenoSqliteConnection(this.#db);

    if (this.#config.onCreateConnection) {
      await this.#config.onCreateConnection(this.#connection);
    }
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    // SQLite only has one single connection. We use a mutex here to wait
    // until the single connection has been released.
    await this.#connectionMutex.lock();
    return this.#connection!;
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('begin'));
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('commit'));
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('rollback'));
  }

  // deno-lint-ignore require-await
  async releaseConnection(): Promise<void> {
    this.#connectionMutex.unlock();
  }

  // deno-lint-ignore require-await
  async destroy(): Promise<void> {
    this.#db?.close();
  }
}

class DenoSqliteConnection implements DatabaseConnection {
  readonly #db: DenoSqlite;

  constructor(db: DenoSqlite) {
    this.#db = db;
  }

  executeQuery<O>({ sql, parameters }: CompiledQuery): Promise<QueryResult<O>> {
    // @ts-expect-error `parameters` types are incompatible, but they should match in reality.
    const rows = this.#db.queryEntries(sql, parameters);

    const { changes, lastInsertRowId } = this.#db;

    return Promise.resolve({
      rows: rows as O[],
      numAffectedRows: BigInt(changes),
      insertId: BigInt(lastInsertRowId),
    });
  }

  // deno-lint-ignore require-yield
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error('Sqlite driver doesn\'t support streaming');
  }
}

class ConnectionMutex {
  #promise?: Promise<void>;
  #resolve?: () => void;

  async lock(): Promise<void> {
    while (this.#promise) {
      await this.#promise;
    }

    this.#promise = new Promise((resolve) => {
      this.#resolve = resolve;
    });
  }

  unlock(): void {
    const resolve = this.#resolve;

    this.#promise = undefined;
    this.#resolve = undefined;

    resolve?.();
  }
}

export { DenoSqliteDriver };
