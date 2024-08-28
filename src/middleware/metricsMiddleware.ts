import { MiddlewareHandler } from '@hono/hono';

import { httpRequestCounter, httpResponseCounter } from '@/metrics.ts';

/** Prometheus metrics middleware that tracks HTTP requests by methods and responses by status code. */
export const metricsMiddleware: MiddlewareHandler = async (c, next) => {
  // HTTP Request.
  const { method } = c.req;
  httpRequestCounter.inc({ method });

  // Wait for other handlers to run.
  await next();

  // HTTP Response.
  const { status } = c.res;
  // Get a parameterized path name like `/posts/:id` instead of `/posts/1234`.
  // Tries to find actual route names first before falling back on potential middleware handlers like `app.use('*')`.
  const path = c.req.matchedRoutes.find((r) => r.method !== 'ALL')?.path ?? c.req.routePath;
  httpResponseCounter.inc({ method, status, path });
};
