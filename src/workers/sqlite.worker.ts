/// <reference lib="webworker" />
import { Database as SQLite } from '@db/sqlite';
import * as Comlink from 'comlink';
import { CompiledQuery, QueryResult } from 'kysely';

import '@/sentry.ts';

let db: SQLite | undefined;

export const SqliteWorker = {
  open(path: string): void {
    db = new SQLite(path);
  },
  executeQuery<R>({ sql, parameters }: CompiledQuery): QueryResult<R> {
    if (!db) throw new Error('Database not open');

    return {
      rows: db!.prepare(sql).all(...parameters as any[]) as R[],
      numAffectedRows: BigInt(db!.changes),
      insertId: BigInt(db!.lastInsertRowId),
    };
  },
  destroy() {
    db?.close();
  },
};

Comlink.expose(SqliteWorker);

self.postMessage(['ready']);
