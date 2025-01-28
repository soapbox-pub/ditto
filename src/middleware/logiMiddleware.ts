import { MiddlewareHandler } from '@hono/hono';
import { logi } from '@soapbox/logi';

export const logiMiddleware: MiddlewareHandler = async (c, next) => {
  const { method } = c.req;
  const { pathname } = new URL(c.req.url);

  logi({ level: 'info', ns: 'ditto.http.request', method, pathname });

  const start = new Date();

  await next();

  const end = new Date();
  const delta = (end.getTime() - start.getTime()) / 1000;

  logi({ level: 'info', ns: 'ditto.http.response', method, pathname, status: c.res.status, delta });
};
