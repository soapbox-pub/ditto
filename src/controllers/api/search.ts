import { AppController } from '@/app.ts';
import { nip19, type NostrEvent, z } from '@/deps.ts';
import { type DittoFilter } from '@/interfaces/DittoFilter.ts';
import { booleanParamSchema } from '@/schema.ts';
import { nostrIdSchema } from '@/schemas/nostr.ts';
import { searchStore } from '@/storages.ts';
import { dedupeEvents } from '@/utils.ts';
import { nip05Cache } from '@/utils/nip05.ts';
import { renderAccount } from '@/views/mastodon/accounts.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';

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

  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 422);
  }

  const signal = AbortSignal.timeout(1000);

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
        .filter((event): event is NostrEvent => event.kind === 0)
        .map((event) => renderAccount(event)),
    ),
    Promise.all(
      results
        .filter((event): event is NostrEvent => event.kind === 1)
        .map((event) => renderStatus(event, c.get('pubkey'))),
    ),
  ]);

  return c.json({
    accounts: accounts.filter(Boolean),
    statuses: statuses.filter(Boolean),
    hashtags: [],
  });
};

/** Get events for the search params. */
function searchEvents({ q, type, limit, account_id }: SearchQuery, signal: AbortSignal): Promise<NostrEvent[]> {
  if (type === 'hashtags') return Promise.resolve([]);

  const filter: DittoFilter = {
    kinds: typeToKinds(type),
    search: q,
    relations: ['author', 'event_stats', 'author_stats'],
    limit,
  };

  if (account_id) {
    filter.authors = [account_id];
  }

  return searchStore.filter([filter], { signal });
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
  const [event] = await searchStore.filter(filters, { limit: 1, signal });
  return event;
}

/** Get filters to lookup the input value. */
async function getLookupFilters({ q, type, resolve }: SearchQuery, signal: AbortSignal): Promise<DittoFilter[]> {
  const filters: DittoFilter[] = [];

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
          if (accounts) filters.push({ kinds: [0], authors: [result.data], relations: ['author_stats'] });
          break;
        case 'nprofile':
          if (accounts) filters.push({ kinds: [0], authors: [result.data.pubkey], relations: ['author_stats'] });
          break;
        case 'note':
          if (statuses) {
            filters.push({ kinds: [1], ids: [result.data], relations: ['author', 'event_stats', 'author_stats'] });
          }
          break;
        case 'nevent':
          if (statuses) {
            filters.push({ kinds: [1], ids: [result.data.id], relations: ['author', 'event_stats', 'author_stats'] });
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
        filters.push({ kinds: [0], authors: [pubkey], relations: ['author_stats'] });
      }
    } catch (_e) {
      // do nothing
    }
  }

  return filters;
}

export { searchController };
