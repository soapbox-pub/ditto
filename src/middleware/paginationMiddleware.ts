import { AppMiddleware } from '@/app.ts';
import { paginationSchema } from '@/schemas/pagination.ts';
import { Storages } from '@/storages.ts';

/** Fixes compatibility with Mastodon apps by that don't use `Link` headers. */
export const paginationMiddleware: AppMiddleware = async (c, next) => {
  const pagination = paginationSchema.parse(c.req.query());

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
      const store = await Storages.db();

      const events = await store.query(
        [{ ids, limit: ids.length }],
        { signal: c.req.raw.signal },
      );

      for (const event of events) {
        if (!until && maxId === event.id) pagination.until = event.created_at;
        if (!since && minId === event.id) pagination.since = event.created_at;
      }
    }
  }

  c.set('pagination', pagination);

  await next();
};
