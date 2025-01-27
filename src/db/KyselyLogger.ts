import { logi } from '@soapbox/logi';
import { Logger } from 'kysely';

import { dbQueriesCounter, dbQueryDurationHistogram } from '@/metrics.ts';

/** Log the SQL for queries. */
export const KyselyLogger: Logger = (event) => {
  const { query, queryDurationMillis } = event;
  const { sql } = query;

  const duration = queryDurationMillis / 1000;

  dbQueriesCounter.inc();
  dbQueryDurationHistogram.observe(duration);

  /** Parameters serialized to JSON. */
  const parameters = query.parameters.map((parameter) => {
    try {
      return JSON.stringify(parameter);
    } catch {
      return String(parameter);
    }
  });

  if (event.level === 'query') {
    logi({ level: 'debug', ns: 'ditto.sql', sql, parameters, duration });
  }

  if (event.level === 'error') {
    const error = event.error instanceof Error
      ? { name: event.error.name, message: event.error.message }
      : { name: 'unknown', message: 'Unknown error' };

    logi({ level: 'error', ns: 'ditto.sql', sql, parameters, error, duration });
  }
};
