import { logi, LogiValue } from '@soapbox/logi';
import { Logger } from 'kysely';

import { dbQueriesCounter, dbQueryDurationHistogram } from '@/metrics.ts';
import { errorJson } from '@/utils/log.ts';

/** Log the SQL for queries. */
export const KyselyLogger: Logger = (event) => {
  const { query, queryDurationMillis } = event;
  const { parameters, sql } = query;

  const duration = queryDurationMillis / 1000;

  dbQueriesCounter.inc();
  dbQueryDurationHistogram.observe(duration);

  if (event.level === 'query') {
    logi({ level: 'debug', ns: 'ditto.sql', sql, parameters: parameters as LogiValue, duration });
  }

  if (event.level === 'error') {
    logi({
      level: 'error',
      ns: 'ditto.sql',
      sql,
      parameters: parameters as LogiValue,
      error: errorJson(event.error),
      duration,
    });
  }
};
