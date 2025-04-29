import { dbQueriesCounter, dbQueryDurationHistogram } from '@ditto/metrics';
import { logi, type LogiValue } from '@soapbox/logi';

import type { Logger } from 'kysely';

/** Log the SQL for queries. */
export const KyselyLogger: Logger = (event) => {
  const { query, queryDurationMillis } = event;
  const { parameters, sql } = query;

  const duration = queryDurationMillis / 1000;

  dbQueriesCounter.inc();
  dbQueryDurationHistogram.observe(duration);

  if (event.level === 'query') {
    logi({ level: 'trace', ns: 'ditto.sql', sql, parameters: parameters as LogiValue, duration });
  }

  if (event.level === 'error') {
    if (event.error instanceof Error) {
      switch (event.error.message) {
        case 'duplicate key value violates unique constraint "nostr_events_pkey"':
        case 'duplicate key value violates unique constraint "author_stats_pkey"':
        case 'duplicate key value violates unique constraint "event_stats_pkey"':
        case 'duplicate key value violates unique constraint "event_zaps_pkey"':
        case 'insert or update on table "event_stats" violates foreign key constraint "event_stats_event_id_fkey"':
          return; // Don't log expected errors
      }
    }

    logi({
      level: 'error',
      ns: 'ditto.sql',
      sql,
      parameters: parameters as LogiValue,
      error: event.error instanceof Error ? event.error : null,
      duration,
    });
  }
};
