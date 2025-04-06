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
