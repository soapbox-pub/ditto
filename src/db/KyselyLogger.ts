import { Stickynotes } from '@soapbox/stickynotes';
import { Logger } from 'kysely';
import { dbQueriesCounter, dbQueryDurationHistogram } from '@/metrics.ts';

/** Log the SQL for queries. */
export const KyselyLogger: Logger = (event) => {
  const console = new Stickynotes('ditto:sql');

  const { query, queryDurationMillis } = event;
  const { sql, parameters } = query;

  dbQueriesCounter.inc();
  dbQueryDurationHistogram.observe(queryDurationMillis);

  console.debug(
    sql,
    JSON.stringify(parameters),
    `\x1b[90m(${(queryDurationMillis / 1000).toFixed(2)}s)\x1b[0m`,
  );
};
