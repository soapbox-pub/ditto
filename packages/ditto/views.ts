import { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { AppContext } from '@/app.ts';
import { Storages } from '@/storages.ts';
import { renderAccount } from '@/views/mastodon/accounts.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';
import { paginated, paginatedList } from '@/utils/api.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { accountFromPubkey } from '@/views/mastodon/accounts.ts';

interface RenderEventAccountsOpts {
  signal?: AbortSignal;
  filterFn?: (event: NostrEvent) => boolean;
}

/** Render account objects for the author of each event. */
async function renderEventAccounts(c: AppContext, filters: NostrFilter[], opts?: RenderEventAccountsOpts) {
  if (!filters.length) {
    return c.json([]);
  }

  const { signal = AbortSignal.timeout(1000), filterFn } = opts ?? {};

  const store = await Storages.db();

  const events = await store.query(filters, { signal })
    // Deduplicate by author.
    .then((events) => Array.from(new Map(events.map((event) => [event.pubkey, event])).values()))
    .then((events) => hydrateEvents({ events, store, signal }))
    .then((events) => filterFn ? events.filter(filterFn) : events);

  const accounts = await Promise.all(
    events.map(({ author, pubkey }) => {
      if (author) {
        return renderAccount(author);
      } else {
        return accountFromPubkey(pubkey);
      }
    }),
  );

  return paginated(c, events, accounts);
}

async function renderAccounts(c: AppContext, pubkeys: string[]) {
  const { offset, limit } = c.get('listPagination');
  const authors = pubkeys.reverse().slice(offset, offset + limit);

  const store = await Storages.db();
  const signal = c.req.raw.signal;

  const events = await store.query([{ kinds: [0], authors }], { signal })
    .then((events) => hydrateEvents({ events, store, signal }));

  const accounts = await Promise.all(
    authors.map((pubkey) => {
      const event = events.find((event) => event.pubkey === pubkey);
      if (event) {
        return renderAccount(event);
      } else {
        return accountFromPubkey(pubkey);
      }
    }),
  );

  return paginatedList(c, { offset, limit }, accounts);
}

/** Render statuses by event IDs. */
async function renderStatuses(c: AppContext, ids: string[], signal = AbortSignal.timeout(1000)) {
  if (!ids.length) {
    return c.json([]);
  }

  const store = await Storages.db();
  const { limit } = c.get('pagination');

  const events = await store.query([{ kinds: [1, 20], ids, limit }], { signal })
    .then((events) => hydrateEvents({ events, store, signal }));

  if (!events.length) {
    return c.json([]);
  }

  const sortedEvents = [...events].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

  const viewerPubkey = await c.get('signer')?.getPublicKey();

  const statuses = await Promise.all(
    sortedEvents.map((event) => renderStatus(event, { viewerPubkey })),
  );

  // TODO: pagination with min_id and max_id based on the order of `ids`.
  return c.json(statuses);
}

export { renderAccounts, renderEventAccounts, renderStatuses };
