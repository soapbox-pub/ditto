/// <reference lib="webworker" />

import { DenoSqlite3 } from '@/deps.ts';

let db: DenoSqlite3;

type Msg =
  | ['open', [string]]
  | ['query', [string, unknown[]]];

function call([cmd, args]: Msg) {
  switch (cmd) {
    case 'open':
      return handleOpen(args[0]);
    case 'query':
      return handleQuery(args[0], args[1]);
  }
}

function handleOpen(path: string): void {
  db = new DenoSqlite3(path);
}

function handleQuery(sql: string, params: any[] = []) {
  return {
    rows: db.prepare(sql).all(...params),
    numAffectedRows: BigInt(db.changes),
    insertId: BigInt(db.lastInsertRowId),
  };
}

self.addEventListener('message', (event: MessageEvent<[string, Msg]>) => {
  const [id, msg] = event.data;
  const result = call(msg);
  self.postMessage([id, result]);
});

self.postMessage(['ready']);
