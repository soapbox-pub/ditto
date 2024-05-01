/// <reference lib="webworker" />
import { Database as SQLite } from '@db/sqlite';
import { Stickynotes } from '@soapbox/stickynotes';
import * as Comlink from 'comlink';
import { CompiledQuery, QueryResult } from 'kysely';
import { ScopedPerformance } from 'scoped_performance';

import '@/sentry.ts';

let db: SQLite | undefined;
const console = new Stickynotes('ditto:sqlite.worker');

export const SqliteWorker = {
  open(path: string): void {
    db = new SQLite(path);
  },
  executeQuery<R>({ sql, parameters }: CompiledQuery): QueryResult<R> {
    if (!db) throw new Error('Database not open');

    const perf = (console.enabled && console.level >= 4) ? new ScopedPerformance() : undefined;

    if (perf) {
      perf.mark('start');
    }

    const result = {
      rows: db!.prepare(sql).all(...parameters as any[]) as R[],
      numAffectedRows: BigInt(db!.changes),
      insertId: BigInt(db!.lastInsertRowId),
    };

    if (perf) {
      const { duration } = perf.measure('end', 'start');

      console.debug(
        sql.replace(/\s+/g, ' '),
        JSON.stringify(parameters),
        `\x1b[90m(${(duration / 1000).toFixed(2)}s)\x1b[0m`,
      );

      perf.clearMarks();
      perf.clearMeasures();
    }

    return result;
  },
  destroy() {
    db?.close();
  },
};

Comlink.expose(SqliteWorker);

self.postMessage(['ready']);
