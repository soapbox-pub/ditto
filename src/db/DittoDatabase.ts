import { Kysely } from 'kysely';

import { DittoTables } from '@/db/DittoTables.ts';

export interface DittoDatabase {
  readonly kysely: Kysely<DittoTables>;
  readonly poolSize: number;
  readonly availableConnections: number;
  listen(channel: string, callback: (payload: string) => void): void;
}

export interface DittoDatabaseOpts {
  poolSize?: number;
  debug?: 0 | 1 | 2 | 3 | 4 | 5;
}
