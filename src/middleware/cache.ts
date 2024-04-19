import { Debug, type MiddlewareHandler } from '@/deps.ts';
import ExpiringCache from '@/utils/expiring-cache.ts';

const debug = Debug('ditto:middleware:cache');

export const cache = (options: {
  cacheName: string;
  expires?: number;
}): MiddlewareHandler => {
  return async (c, next) => {
    const key = c.req.url.replace('http://', 'https://');
    const cache = new ExpiringCache(await caches.open(options.cacheName));
    const response = await cache.match(key);
    if (!response) {
      debug('Building cache for page', c.req.url);
      await next();
      const response = c.res.clone();
      if (response.status < 500) {
        await cache.putExpiring(key, response, options.expires ?? 0);
      }
    } else {
      debug('Serving page from cache', c.req.url);
      return response;
    }
  };
};
