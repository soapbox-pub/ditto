import { MiddlewareHandler } from '@hono/hono';

import { httpRequestCounter, httpResponseCounter } from '@/metrics.ts';

export const metricsMiddleware: MiddlewareHandler = async (c, next) => {
  const { method } = c.req;
  httpRequestCounter.inc({ method });

  await next();

  const { status } = c.res;
  const path = c.req.matchedRoutes.find((r) => r.method !== 'ALL')?.path ?? c.req.routePath;
  httpResponseCounter.inc({ status, path });
};
