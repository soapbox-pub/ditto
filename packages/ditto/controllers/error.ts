import { ErrorHandler } from '@hono/hono';
import { HTTPException } from '@hono/hono/http-exception';
import { logi } from '@soapbox/logi';

import { errorJson } from '@/utils/log.ts';

import type { DittoEnv } from '@ditto/mastoapi/router';

export const errorHandler: ErrorHandler<DittoEnv> = (err, c) => {
  const { requestId } = c.var;
  const { method } = c.req;
  const { pathname } = new URL(c.req.url);

  c.header('Cache-Control', 'no-store');

  if (err instanceof HTTPException) {
    if (err.res) {
      return err.res;
    } else {
      return c.json({ error: err.message }, err.status);
    }
  }

  if (err.message === 'canceling statement due to statement timeout') {
    return c.json({ error: 'The server was unable to respond in a timely manner' }, 500);
  }

  logi({
    level: 'error',
    ns: 'ditto.http',
    msg: 'Unhandled error',
    method,
    pathname,
    requestId,
    error: errorJson(err),
  });

  return c.json({ error: 'Something went wrong' }, 500);
};
