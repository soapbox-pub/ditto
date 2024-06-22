import { MiddlewareHandler } from '@hono/hono';

import { httpRequestCounter } from '@/metrics.ts';

export const metricsMiddleware: MiddlewareHandler = async (c, next) => {
  const { method, path } = c.req;
  httpRequestCounter.inc({ method, path });

  await next();
};
