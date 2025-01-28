import { logi } from '@soapbox/logi';
import { Logger } from 'kysely';

import { dbQueriesCounter, dbQueryDurationHistogram } from '@/metrics.ts';
import { errorJson } from '@/utils/log.ts';
import { JsonValue } from '@std/json';

/** Log the SQL for queries. */
export const KyselyLogger: Logger = (event) => {
  const { query, queryDurationMillis } = event;
  const { sql } = query;

  const duration = queryDurationMillis / 1000;

  dbQueriesCounter.inc();
  dbQueryDurationHistogram.observe(duration);

  const parameters = query.parameters.map(serializeParameter);

  if (event.level === 'query') {
    logi({ level: 'debug', ns: 'ditto.sql', sql, parameters, duration });
  }

  if (event.level === 'error') {
    logi({ level: 'error', ns: 'ditto.sql', sql, parameters, error: errorJson(event.error), duration });
  }
};

/** Serialize parameter to JSON. */
function serializeParameter(parameter: unknown): JsonValue {
  if (Array.isArray(parameter)) {
    return parameter.map(serializeParameter);
  }
  if (
    typeof parameter === 'string' || typeof parameter === 'number' || typeof parameter === 'boolean' ||
    parameter === null
  ) {
    return parameter;
  }
  try {
    return JSON.stringify(parameter);
  } catch {
    return String(parameter);
  }
}
