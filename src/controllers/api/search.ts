import { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { z } from 'zod';

import { AppController } from '@/app.ts';
import { booleanParamSchema } from '@/schema.ts';
import { nostrIdSchema } from '@/schemas/nostr.ts';
import { searchStore } from '@/storages.ts';
import { dedupeEvents } from '@/utils.ts';
import { nip05Cache } from '@/utils/nip05.ts';
import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';

/** Matches NIP-05 names with or without an @ in front. */
const ACCT_REGEX = /^@?(?:([\w.+-]+)@)?([\w.-]+)$/;

const searchQuerySchema = z.object({
  q: z.string().transform(decodeURIComponent),
  type: z.enum(['accounts', 'statuses', 'hashtags']).optional(),
  resolve: booleanParamSchema.optional().transform(Boolean),
  following: z.boolean().default(false),
  account_id: nostrIdSchema.optional(),
  limit: z.coerce.number().catch(20).transform((value) => Math.min(Math.max(value, 0), 40)),
});

type SearchQuery = z.infer<typeof searchQuerySchema>;

const searchController: AppController = async (c) => {
  const result = searchQuerySchema.safeParse(c.req.query());
  const { signal } = c.req.raw;

  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 422);
  }

  const [event, events] = await Promise.all([
    lookupEvent(result.data, signal),
    searchEvents(result.data, signal),
  ]);

  if (event) {
    events.push(event);
  }

  const results = dedupeEvents(events);

  const [accounts, statuses] = await Promise.all([
    Promise.all(
      results
        .filter((event) => event.kind === 0)
        .map((event) => renderAccount(event))
        .filter(Boolean),
    ),
    Promise.all(
      results
        .filter((event) => event.kind === 1)
        .map((event) => renderStatus(event, { viewerPubkey: c.get('pubkey') }))
        .filter(Boolean),
    ),
  ]);

  if ((result.data.type === 'accounts') && (accounts.length < 1) && (result.data.q.match(/npub1\w+/))) {
    const possibleNpub = result.data.q;
    try {
      const npubHex = nip19.decode(possibleNpub);
      accounts.push(await accountFromPubkey(String(npubHex.data)));
    } catch (e) {
      console.log(e);
    }
  }

  return c.json({
    accounts,
    statuses,
    hashtags: [],
  });
};

/** Get events for the search params. */
function searchEvents({ q, type, limit, account_id }: SearchQuery, signal: AbortSignal): Promise<NostrEvent[]> {
  if (type === 'hashtags') return Promise.resolve([]);

  const filter: NostrFilter = {
    kinds: typeToKinds(type),
    search: q,
    limit,
  };

  if (account_id) {
    filter.authors = [account_id];
  }

  return searchStore.query([filter], { signal })
    .then((events) => hydrateEvents({ events, storage: searchStore, signal }));
}

/** Get event kinds to search from `type` query param. */
function typeToKinds(type: SearchQuery['type']): number[] {
  switch (type) {
    case 'accounts':
      return [0];
    case 'statuses':
      return [1];
    default:
      return [0, 1];
  }
}

/** Resolve a searched value into an event, if applicable. */
async function lookupEvent(query: SearchQuery, signal: AbortSignal): Promise<NostrEvent | undefined> {
  const filters = await getLookupFilters(query, signal);

  return searchStore.query(filters, { limit: 1, signal })
    .then((events) => hydrateEvents({ events, storage: searchStore, signal }))
    .then(([event]) => event);
}

/** Get filters to lookup the input value. */
async function getLookupFilters({ q, type, resolve }: SearchQuery, signal: AbortSignal): Promise<NostrFilter[]> {
  const filters: NostrFilter[] = [];

  const accounts = !type || type === 'accounts';
  const statuses = !type || type === 'statuses';

  if (!resolve || type === 'hashtags') {
    return filters;
  }

  if (new RegExp(`^${nip19.BECH32_REGEX.source}$`).test(q)) {
    try {
      const result = nip19.decode(q);
      switch (result.type) {
        case 'npub':
          if (accounts) filters.push({ kinds: [0], authors: [result.data] });
          break;
        case 'nprofile':
          if (accounts) filters.push({ kinds: [0], authors: [result.data.pubkey] });
          break;
        case 'note':
          if (statuses) {
            filters.push({ kinds: [1], ids: [result.data] });
          }
          break;
        case 'nevent':
          if (statuses) {
            filters.push({ kinds: [1], ids: [result.data.id] });
          }
          break;
      }
    } catch (_e) {
      // do nothing
    }
  } else if (/^[0-9a-f]{64}$/.test(q)) {
    if (accounts) filters.push({ kinds: [0], authors: [q] });
    if (statuses) filters.push({ kinds: [1], ids: [q] });
  } else if (accounts && ACCT_REGEX.test(q)) {
    try {
      const { pubkey } = await nip05Cache.fetch(q, { signal });
      if (pubkey) {
        filters.push({ kinds: [0], authors: [pubkey] });
      }
    } catch (_e) {
      // do nothing
    }
  }

  return filters;
}

export { searchController };
