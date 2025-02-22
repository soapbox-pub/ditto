import { buildLinkHeader, buildListLinkHeader } from './link-header.ts';

import type { Context } from '@hono/hono';
import type { NostrEvent } from '@nostrify/nostrify';

type HeaderRecord = Record<string, string | string[]>;

/** Return results with pagination headers. Assumes chronological sorting of events. */
export function paginated(
  c: Context,
  events: NostrEvent[],
  body: object | unknown[],
  headers: HeaderRecord = {},
): Response {
  const link = buildLinkHeader(c.req.url, events);

  if (link) {
    headers.link = link;
  }

  // Filter out undefined entities.
  const results = Array.isArray(body) ? body.filter(Boolean) : body;
  return c.json(results, 200, headers);
}

/** paginate a list of tags. */
export function paginatedList(
  c: Context,
  params: { offset: number; limit: number },
  body: object | unknown[],
  headers: HeaderRecord = {},
): Response {
  const link = buildListLinkHeader(c.req.url, params);
  const hasMore = Array.isArray(body) ? body.length > 0 : true;

  if (link) {
    headers.link = hasMore ? link : link.split(', ').find((link) => link.endsWith('; rel="prev"'))!;
  }

  // Filter out undefined entities.
  const results = Array.isArray(body) ? body.filter(Boolean) : body;
  return c.json(results, 200, headers);
}
