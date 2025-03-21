import { paginated, paginatedList } from '../pagination/paginate.ts';
import { paginationSchema, type PaginationSchemaOpts } from '../pagination/schema.ts';

import type { DittoMiddleware } from '@ditto/mastoapi/router';
import type { NostrEvent } from '@nostrify/nostrify';

interface Pagination {
  since?: number;
  until?: number;
  limit: number;
}

interface ListPagination {
  limit: number;
  offset: number;
}

type HeaderRecord = Record<string, string | string[]>;
type PaginateFn = (events: NostrEvent[], body: object | unknown[], headers?: HeaderRecord) => Response;
type ListPaginateFn = (params: ListPagination, body: object | unknown[], headers?: HeaderRecord) => Response;

interface PaginationMiddlewareOpts extends PaginationSchemaOpts {
  type?: string;
}

/** Fixes compatibility with Mastodon apps by that don't use `Link` headers. */
// @ts-ignore Types are right.
export function paginationMiddleware(): DittoMiddleware<{ pagination: Pagination; paginate: PaginateFn }>;
export function paginationMiddleware(
  opts: PaginationMiddlewareOpts & { type: 'list' },
): DittoMiddleware<{ pagination: ListPagination; paginate: ListPaginateFn }>;
export function paginationMiddleware(
  opts?: PaginationMiddlewareOpts,
): DittoMiddleware<{ pagination: Pagination; paginate: PaginateFn }>;
export function paginationMiddleware(
  opts: PaginationMiddlewareOpts = {},
): DittoMiddleware<{ pagination?: Pagination | ListPagination; paginate: PaginateFn | ListPaginateFn }> {
  return async (c, next) => {
    const { relay } = c.var;

    const pagination = paginationSchema(opts).parse(c.req.query());

    const {
      max_id: maxId,
      min_id: minId,
      since,
      until,
    } = pagination;

    if ((maxId && !until) || (minId && !since)) {
      const ids: string[] = [];

      if (maxId) ids.push(maxId);
      if (minId) ids.push(minId);

      if (ids.length) {
        const events = await relay.query(
          [{ ids, limit: ids.length }],
          { signal: c.req.raw.signal },
        );

        for (const event of events) {
          if (!until && maxId === event.id) pagination.until = event.created_at;
          if (!since && minId === event.id) pagination.since = event.created_at;
        }
      }
    }

    if (opts.type === 'list') {
      c.set('pagination', {
        limit: pagination.limit,
        offset: pagination.offset,
      });
      const fn: ListPaginateFn = (params, body, headers) => paginatedList(c, params, body, headers);
      c.set('paginate', fn);
    } else {
      c.set('pagination', {
        since: pagination.since,
        until: pagination.until,
        limit: pagination.limit,
      });
      const fn: PaginateFn = (events, body, headers) => paginated(c, events, body, headers);
      c.set('paginate', fn);
    }

    await next();
  };
}
