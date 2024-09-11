import { Kysely } from 'kysely';

import { DittoTables } from '@/db/DittoTables.ts';

export interface DittoDatabase {
  readonly kysely: Kysely<DittoTables>;
  readonly poolSize: number;
  readonly availableConnections: number;
}

export interface DittoDatabaseOpts {
  poolSize?: number;
}
