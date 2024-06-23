import { MiddlewareHandler } from '@hono/hono';

import { httpRequestCounter } from '@/metrics.ts';

export const metricsMiddleware: MiddlewareHandler = async (c, next) => {
  const { method } = c.req;
  httpRequestCounter.inc({ method });

  await next();
};
