import { NostrEvent } from '@nostrify/nostrify';
import { Kysely } from 'kysely';

import { DittoTables } from '@/db/DittoTables.ts';

export interface DittoDatabase {
  readonly kysely: Kysely<DittoTables>;
  readonly poolSize: number;
  readonly availableConnections: number;
  readonly listenNostr: (onEvent: (event: NostrEvent) => void) => void;
}

export interface DittoDatabaseOpts {
  poolSize?: number;
  debug?: 0 | 1 | 2 | 3 | 4 | 5;
}
