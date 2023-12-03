/// <reference lib="webworker" />

import { Comlink, type CompiledQuery, DenoSqlite3, type QueryResult } from '@/deps.ts';

let db: DenoSqlite3 | undefined;

export const SqliteWorker = {
  open(path: string): void {
    db = new DenoSqlite3(path);
  },
  executeQuery<R>({ sql, parameters }: CompiledQuery): QueryResult<R> {
    if (!db) throw new Error('Database not open');
    return {
      rows: db.prepare(sql).all(...parameters as any[]) as R[],
      numAffectedRows: BigInt(db.changes),
      insertId: BigInt(db.lastInsertRowId),
    };
  },
  destroy() {
    db?.close();
  },
};

Comlink.expose(SqliteWorker);

self.postMessage(['ready']);
