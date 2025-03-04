import { logi } from '@soapbox/logi';

import type { DittoMiddleware } from '@ditto/mastoapi/router';

export const logiMiddleware: DittoMiddleware = async (c, next) => {
  const { requestId } = c.var;
  const { method } = c.req;
  const { pathname } = new URL(c.req.url);

  const ip = c.req.header('x-real-ip');

  logi({ level: 'info', ns: 'ditto.http.request', method, pathname, ip, requestId });

  const start = new Date();

  await next();

  const end = new Date();
  const duration = (end.getTime() - start.getTime()) / 1000;
  const level = c.res.status >= 500 ? 'error' : 'info';

  logi({ level, ns: 'ditto.http.response', method, pathname, status: c.res.status, duration, ip, requestId });
};
