import { Debug, type MiddlewareHandler } from '@/deps.ts';

const debug = Debug('ditto:middleware:cache');

interface CacheOpts {
  expires: number;
}

/** In-memory cache middleware. */
export const cache = (opts: CacheOpts): MiddlewareHandler => {
  let response: Response | undefined;
  let expires = Date.now() + opts.expires;

  return async (c, next) => {
    if (!response || (Date.now() > expires)) {
      debug('Building cache for page', c.req.url);
      expires = Date.now() + opts.expires;

      await next();

      const res = c.res.clone();
      if (res.status < 500) {
        response = res;
      }
    } else {
      debug('Serving page from cache', c.req.url);
      return response.clone();
    }
  };
};
