/// <reference lib="webworker" />
import { ScopedPerformance } from 'https://deno.land/x/scoped_performance@v2.0.0/mod.ts';
import { Comlink, type CompiledQuery, Debug, DenoSqlite3, type QueryResult } from '@/deps.ts';
import '@/sentry.ts';

let db: DenoSqlite3 | undefined;
const debug = Debug('ditto:sqlite.worker');

export const SqliteWorker = {
  open(path: string): void {
    db = new DenoSqlite3(path);
  },
  executeQuery<R>({ sql, parameters }: CompiledQuery): QueryResult<R> {
    if (!db) throw new Error('Database not open');

    const perf = new ScopedPerformance();
    perf.mark('start');

    const result = {
      rows: db!.prepare(sql).all(...parameters as any[]) as R[],
      numAffectedRows: BigInt(db!.changes),
      insertId: BigInt(db!.lastInsertRowId),
    };

    const { duration } = perf.measure('end', 'start');
    debug(`${sql} \x1b[90m(${(duration / 1000).toFixed(2)}s)\x1b[0m`);

    perf.clearMarks();
    perf.clearMeasures();

    return result;
  },
  destroy() {
    db?.close();
  },
};

Comlink.expose(SqliteWorker);

self.postMessage(['ready']);
