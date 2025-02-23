import { buildLinkHeader, buildListLinkHeader } from './link-header.ts';

import type { DittoEnv } from '@ditto/mastoapi/router';
import type { Context } from '@hono/hono';
import type { NostrEvent } from '@nostrify/nostrify';

type HeaderRecord = Record<string, string | string[]>;

/** Return results with pagination headers. Assumes chronological sorting of events. */
export function paginated<E extends DittoEnv>(
  c: Context<E>,
  events: NostrEvent[],
  body: object | unknown[],
  headers: HeaderRecord = {},
): Response {
  const { conf } = c.var;

  const url = conf.local(c.req.url);
  const link = buildLinkHeader(url, events);

  if (link) {
    headers.link = link;
  }

  // Filter out undefined entities.
  const results = Array.isArray(body) ? body.filter(Boolean) : body;
  return c.json(results, 200, headers);
}

/** paginate a list of tags. */
export function paginatedList<E extends DittoEnv>(
  c: Context<E>,
  params: { offset: number; limit: number },
  body: object | unknown[],
  headers: HeaderRecord = {},
): Response {
  const { conf } = c.var;

  const url = conf.local(c.req.url);
  const link = buildListLinkHeader(url, params);
  const hasMore = Array.isArray(body) ? body.length > 0 : true;

  if (link) {
    headers.link = hasMore ? link : link.split(', ').find((link) => link.endsWith('; rel="prev"'))!;
  }

  // Filter out undefined entities.
  const results = Array.isArray(body) ? body.filter(Boolean) : body;
  return c.json(results, 200, headers);
}
