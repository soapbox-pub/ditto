import { MiddlewareHandler } from '@hono/hono';

/**
 * Options for the `cacheControlMiddleware` middleware.
 *
 * NOTE: All numerical values are in **seconds**.
 *
 * See the definitions of [fresh](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching#fresh_and_stale_based_on_age) and [stale](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching#fresh_and_stale_based_on_age).
 */
export interface CacheControlMiddlewareOpts {
  /** Indicates that the response remains fresh until _N_ seconds after the response is generated. */
  maxAge?: number;
  /** Indicates how long the response remains fresh in a shared cache. */
  sMaxAge?: number;
  /** Indicates that the response can be stored in caches, but the response must be validated with the origin server before each reuse, even when the cache is disconnected from the origin server. */
  noCache?: boolean;
  /** Indicates that the response can be stored in caches and can be reused while fresh. */
  mustRevalidate?: boolean;
  /** Equivalent of `must-revalidate`, but specifically for shared caches only. */
  proxyRevalidate?: boolean;
  /** Indicates that any caches of any kind (private or shared) should not store this response. */
  noStore?: boolean;
  /** Indicates that the response can be stored only in a private cache (e.g. local caches in browsers). */
  private?: boolean;
  /** Indicates that the response can be stored in a shared cache. */
  public?: boolean;
  /** Indicates that a cache should store the response only if it understands the requirements for caching based on status code. */
  mustUnderstand?: boolean;
  /** Indicates that any intermediary (regardless of whether it implements a cache) shouldn't transform the response contents. */
  noTransform?: boolean;
  /** Indicates that the response will not be updated while it's fresh. */
  immutable?: boolean;
  /** Indicates that the cache could reuse a stale response while it revalidates it to a cache. */
  staleWhileRevalidate?: number;
  /** indicates that the cache can reuse a stale response when an upstream server generates an error, or when the error is generated locally. */
  staleIfError?: number;
}

/** Adds a [`Cache-Control`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control) header to the response. */
export function cacheControlMiddleware(opts: CacheControlMiddlewareOpts): MiddlewareHandler {
  return async (c, next) => {
    const directives: string[] = [];

    if (typeof opts.maxAge === 'number') {
      directives.push(`max-age=${opts.maxAge}`);
    }

    if (typeof opts.sMaxAge === 'number') {
      directives.push(`s-maxage=${opts.sMaxAge}`);
    }

    if (opts.noCache) {
      directives.push('no-cache');
    }

    if (opts.mustRevalidate) {
      directives.push('must-revalidate');
    }

    if (opts.proxyRevalidate) {
      directives.push('proxy-revalidate');
    }

    if (opts.noStore) {
      directives.push('no-store');
    }

    if (opts.private) {
      directives.push('private');
    }

    if (opts.public) {
      directives.push('public');
    }

    if (opts.mustUnderstand) {
      directives.push('must-understand');
    }

    if (opts.noTransform) {
      directives.push('no-transform');
    }

    if (opts.immutable) {
      directives.push('immutable');
    }

    if (typeof opts.staleWhileRevalidate === 'number') {
      directives.push(`stale-while-revalidate=${opts.staleWhileRevalidate}`);
    }

    if (typeof opts.staleIfError === 'number') {
      directives.push(`stale-if-error=${opts.staleIfError}`);
    }

    if (directives.length) {
      c.header('Cache-Control', directives.join(', '));
    }

    await next();
  };
}
