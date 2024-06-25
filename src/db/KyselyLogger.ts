import { Stickynotes } from '@soapbox/stickynotes';
import { Logger } from 'kysely';
import { dbQueryTime } from '@/metrics.ts';

export const prometheusParams = {
  threshold: 10000
};

/** Log the SQL for queries. */
export const KyselyLogger: Logger = (event) => {
  if (event.level === 'query') {
    const console = new Stickynotes('ditto:sql');

    const { query, queryDurationMillis } = event;
    const { sql, parameters } = query;

    if (queryDurationMillis > prometheusParams.threshold) {
      const labels = {
        sql,
        parameters: JSON.stringify(
          parameters.filter((param: any) => ['string', 'number'].includes(typeof param)) as (string | number)[]
        )
      }
      dbQueryTime.observe(labels, queryDurationMillis);
    }

    console.debug(
      sql,
      JSON.stringify(parameters),
      `\x1b[90m(${(queryDurationMillis / 1000).toFixed(2)}s)\x1b[0m`,
    );
  }
};
