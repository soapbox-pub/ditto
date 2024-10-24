import { NostrEvent, NostrFilter, NSchema as n } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { z } from 'zod';

import { AppController } from '@/app.ts';
import { booleanParamSchema } from '@/schema.ts';
import { Storages } from '@/storages.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { extractIdentifier, lookupPubkey } from '@/utils/lookup.ts';
import { nip05Cache } from '@/utils/nip05.ts';
import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';
import { getFollowedPubkeys } from '@/queries.ts';
import { getPubkeysBySearch } from '@/utils/search.ts';

const searchQuerySchema = z.object({
  q: z.string().transform(decodeURIComponent),
  type: z.enum(['accounts', 'statuses', 'hashtags']).optional(),
  resolve: booleanParamSchema.optional().transform(Boolean),
  following: z.boolean().default(false),
  account_id: n.id().optional(),
  limit: z.coerce.number().catch(20).transform((value) => Math.min(Math.max(value, 0), 40)),
  offset: z.coerce.number().nonnegative().catch(0),
});

type SearchQuery = z.infer<typeof searchQuerySchema>;

const searchController: AppController = async (c) => {
  const result = searchQuerySchema.safeParse(c.req.query());
  const { signal } = c.req.raw;
  const viewerPubkey = await c.get('signer')?.getPublicKey();

  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 422);
  }

  const event = await lookupEvent(result.data, signal);
  const lookup = extractIdentifier(result.data.q);

  // Render account from pubkey.
  if (!event && lookup) {
    const pubkey = await lookupPubkey(lookup);
    return c.json({
      accounts: pubkey ? [await accountFromPubkey(pubkey)] : [],
      statuses: [],
      hashtags: [],
    });
  }

  let events: NostrEvent[] = [];

  if (event) {
    events = [event];
  }
  events.push(...(await searchEvents({ ...result.data, viewerPubkey }, signal)));

  const [accounts, statuses] = await Promise.all([
    Promise.all(
      events
        .filter((event) => event.kind === 0)
        .map((event) => renderAccount(event))
        .filter(Boolean),
    ),
    Promise.all(
      events
        .filter((event) => event.kind === 1)
        .map((event) => renderStatus(event, { viewerPubkey }))
        .filter(Boolean),
    ),
  ]);

  return c.json({
    accounts,
    statuses,
    hashtags: [],
  });
};

/** Get events for the search params. */
async function searchEvents(
  { q, type, limit, offset, account_id, viewerPubkey }: SearchQuery & { viewerPubkey?: string },
  signal: AbortSignal,
): Promise<NostrEvent[]> {
  // Hashtag search is not supported.
  if (type === 'hashtags') {
    return Promise.resolve([]);
  }

  const store = await Storages.search();

  const filter: NostrFilter = {
    kinds: typeToKinds(type),
    search: q,
    limit,
  };

  // For account search, use a special index, and prioritize followed accounts.
  if (type === 'accounts') {
    const kysely = await Storages.kysely();

    const followedPubkeys = viewerPubkey ? await getFollowedPubkeys(viewerPubkey) : new Set<string>();
    const searchPubkeys = await getPubkeysBySearch(kysely, { q, limit, offset, followedPubkeys });

    filter.authors = [...searchPubkeys];
    filter.search = undefined;
  }

  // Results should only be shown from one author.
  if (account_id) {
    filter.authors = [account_id];
  }

  // Query the events.
  let events = await store
    .query([filter], { signal })
    .then((events) => hydrateEvents({ events, store, signal }));

  // When using an authors filter, return the events in the same order as the filter.
  if (filter.authors) {
    events = filter.authors
      .map((pubkey) => events.find((event) => event.pubkey === pubkey))
      .filter((event) => !!event);
  }

  return events;
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
  const store = await Storages.search();

  return store.query(filters, { limit: 1, signal })
    .then((events) => hydrateEvents({ events, store, signal }))
    .then(([event]) => event);
}

/** Get filters to lookup the input value. */
async function getLookupFilters({ q, type, resolve }: SearchQuery, signal: AbortSignal): Promise<NostrFilter[]> {
  const accounts = !type || type === 'accounts';
  const statuses = !type || type === 'statuses';

  if (!resolve || type === 'hashtags') {
    return [];
  }

  if (n.id().safeParse(q).success) {
    const filters: NostrFilter[] = [];
    if (accounts) filters.push({ kinds: [0], authors: [q] });
    if (statuses) filters.push({ kinds: [1], ids: [q] });
    return filters;
  }

  const lookup = extractIdentifier(q);
  if (!lookup) return [];

  try {
    const result = nip19.decode(lookup);
    const filters: NostrFilter[] = [];
    switch (result.type) {
      case 'npub':
        if (accounts) filters.push({ kinds: [0], authors: [result.data] });
        break;
      case 'nprofile':
        if (accounts) filters.push({ kinds: [0], authors: [result.data.pubkey] });
        break;
      case 'note':
        if (statuses) filters.push({ kinds: [1], ids: [result.data] });
        break;
      case 'nevent':
        if (statuses) filters.push({ kinds: [1], ids: [result.data.id] });
        break;
    }
    return filters;
  } catch {
    // fall through
  }

  try {
    const { pubkey } = await nip05Cache.fetch(lookup, { signal });
    if (pubkey) {
      return [{ kinds: [0], authors: [pubkey] }];
    }
  } catch {
    // fall through
  }

  return [];
}

export { searchController };
