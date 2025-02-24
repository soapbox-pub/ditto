import type { Kysely } from 'kysely';

import type { DittoTables } from './DittoTables.ts';

export interface DittoDB extends AsyncDisposable {
  readonly kysely: Kysely<DittoTables>;
  readonly poolSize: number;
  readonly availableConnections: number;
  migrate(): Promise<void>;
  listen(channel: string, callback: (payload: string) => void): void;
}

export interface DittoDBOpts {
  poolSize?: number;
  debug?: 0 | 1 | 2 | 3 | 4 | 5;
}
