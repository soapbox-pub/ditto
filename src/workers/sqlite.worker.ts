/// <reference lib="webworker" />

import { Comlink, type CompiledQuery, Debug, DenoSqlite3, type QueryResult, Sentry } from '@/deps.ts';
import '@/sentry.ts';

let db: DenoSqlite3 | undefined;
const debug = Debug('ditto:sqlite.worker');

export const SqliteWorker = {
  open(path: string): void {
    db = new DenoSqlite3(path);
  },
  executeQuery<R>({ sql, parameters }: CompiledQuery): QueryResult<R> {
    if (!db) throw new Error('Database not open');
    debug(sql);

    const result: QueryResult<R> = Sentry.startSpan({ name: sql, op: 'db.query' }, () => {
      return {
        rows: db!.prepare(sql).all(...parameters as any[]) as R[],
        numAffectedRows: BigInt(db!.changes),
        insertId: BigInt(db!.lastInsertRowId),
      };
    });

    return result;
  },
  destroy() {
    db?.close();
  },
};

Comlink.expose(SqliteWorker);

self.postMessage(['ready']);
