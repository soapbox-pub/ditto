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
    const now = Date.now();
    const expired = now > expires;

    async function updateCache() {
      await next();
      const res = c.res.clone();
      if (res.status < 500) {
        response = res;
      }
      return res;
    }

    if (response && !expired) {
      debug('Serving page from cache', c.req.url);
      return response.clone();
    } else {
      expires = Date.now() + opts.expires;
      if (response && expired) {
        debug('Serving stale cache, rebuilding', c.req.url);
        const stale = response.clone();
        updateCache();
        await new Promise((resolve) => setTimeout(resolve, 0));
        return stale;
      }
      debug('Building cache for page', c.req.url);
      return await updateCache();
    }
  };
};
