import { AppContext } from '@/app.ts';
import { eventsDB } from '@/db/events.ts';
import { type Filter } from '@/deps.ts';
import { renderAccount } from '@/views/mastodon/accounts.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';
import { paginated, paginationSchema } from '@/utils/api.ts';

/** Render account objects for the author of each event. */
async function renderEventAccounts(c: AppContext, filters: Filter[], signal = AbortSignal.timeout(1000)) {
  if (!filters.length) {
    return c.json([]);
  }

  const events = await eventsDB.getEvents(filters, { signal });
  const pubkeys = new Set(events.map(({ pubkey }) => pubkey));

  if (!pubkeys.size) {
    return c.json([]);
  }

  const authors = await eventsDB.getEvents(
    [{ kinds: [0], authors: [...pubkeys], relations: ['author_stats'] }],
    { signal },
  );

  const accounts = await Promise.all(
    authors.map((event) => renderAccount(event)),
  );

  return paginated(c, events, accounts);
}

async function renderAccounts(c: AppContext, authors: string[], signal = AbortSignal.timeout(1000)) {
  const { since, until, limit } = paginationSchema.parse(c.req.query());

  const events = await eventsDB.getEvents(
    [{ kinds: [0], authors, relations: ['author_stats'], since, until, limit }],
    { signal },
  );

  const accounts = await Promise.all(
    events.map((event) => renderAccount(event)),
  );

  return paginated(c, events, accounts);
}

/** Render statuses by event IDs. */
async function renderStatuses(c: AppContext, ids: string[], signal = AbortSignal.timeout(1000)) {
  if (!ids.length) {
    return c.json([]);
  }

  const { limit } = paginationSchema.parse(c.req.query());

  const events = await eventsDB.getEvents(
    [{ kinds: [1], ids, relations: ['author', 'event_stats', 'author_stats'], limit }],
    { signal },
  );

  if (!events.length) {
    return c.json([]);
  }

  const sortedEvents = [...events].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

  const statuses = await Promise.all(
    sortedEvents.map((event) => renderStatus(event, c.get('pubkey'))),
  );

  // TODO: pagination with min_id and max_id based on the order of `ids`.
  return c.json(statuses);
}

export { renderAccounts, renderEventAccounts, renderStatuses };
