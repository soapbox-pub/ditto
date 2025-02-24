import { paginated, paginatedList } from '@ditto/mastoapi/pagination';
import { NostrEvent, NostrFilter, NSchema as n } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { z } from 'zod';

import { AppContext, AppController } from '@/app.ts';
import { booleanParamSchema } from '@/schema.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { extractIdentifier, lookupPubkey } from '@/utils/lookup.ts';
import { lookupNip05 } from '@/utils/nip05.ts';
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
  offset: z.coerce.number().nonnegative().catch(0),
});

type SearchQuery = z.infer<typeof searchQuerySchema> & { since?: number; until?: number; limit: number };

const searchController: AppController = async (c) => {
  const { relay, user, pagination, signal } = c.var;

  const result = searchQuerySchema.safeParse(c.req.query());
  const viewerPubkey = await user?.signer.getPublicKey();

  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 422);
  }

  const event = await lookupEvent(c, { ...result.data, ...pagination });
  const lookup = extractIdentifier(result.data.q);

  // Render account from pubkey.
  if (!event && lookup) {
    const pubkey = await lookupPubkey(lookup, c.var);
    return c.json({
      accounts: pubkey ? [accountFromPubkey(pubkey)] : [],
      statuses: [],
      hashtags: [],
    });
  }

  let events: NostrEvent[] = [];

  if (event) {
    events = [event];
  }

  events.push(...(await searchEvents(c, { ...result.data, ...pagination, viewerPubkey }, signal)));

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
        .map((event) => renderStatus(relay, event, { viewerPubkey }))
        .filter(Boolean),
    ),
  ]);

  const body = {
    accounts,
    statuses,
    hashtags: [],
  };

  if (result.data.type === 'accounts') {
    return paginatedList(c, { ...result.data, ...pagination }, body);
  } else {
    return paginated(c, events, body);
  }
};

/** Get events for the search params. */
async function searchEvents(
  c: AppContext,
  { q, type, since, until, limit, offset, account_id, viewerPubkey }: SearchQuery & { viewerPubkey?: string },
  signal: AbortSignal,
): Promise<NostrEvent[]> {
  const { relay, db } = c.var;

  // Hashtag search is not supported.
  if (type === 'hashtags') {
    return Promise.resolve([]);
  }

  const filter: NostrFilter = {
    kinds: typeToKinds(type),
    search: q,
    since,
    until,
    limit,
  };

  // For account search, use a special index, and prioritize followed accounts.
  if (type === 'accounts') {
    const following = viewerPubkey ? await getFollowedPubkeys(relay, viewerPubkey) : new Set<string>();
    const searchPubkeys = await getPubkeysBySearch(db.kysely, { q, limit, offset, following });

    filter.authors = [...searchPubkeys];
    filter.search = undefined;
  }

  // Results should only be shown from one author.
  if (account_id) {
    filter.authors = [account_id];
  }

  // Query the events.
  let events = await relay
    .query([filter], { signal })
    .then((events) => hydrateEvents({ ...c.var, events }));

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
async function lookupEvent(c: AppContext, query: SearchQuery): Promise<NostrEvent | undefined> {
  const { relay, signal } = c.var;
  const filters = await getLookupFilters(c, query);

  return relay.query(filters, { signal })
    .then((events) => hydrateEvents({ ...c.var, events }))
    .then(([event]) => event);
}

/** Get filters to lookup the input value. */
async function getLookupFilters(c: AppContext, { q, type, resolve }: SearchQuery): Promise<NostrFilter[]> {
  const accounts = !type || type === 'accounts';
  const statuses = !type || type === 'statuses';

  if (!resolve || type === 'hashtags') {
    return [];
  }

  if (n.id().safeParse(q).success) {
    const filters: NostrFilter[] = [];
    if (accounts) filters.push({ kinds: [0], authors: [q] });
    if (statuses) filters.push({ kinds: [1, 20], ids: [q] });
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
        if (statuses) filters.push({ kinds: [1, 20], ids: [result.data] });
        break;
      case 'nevent':
        if (statuses) filters.push({ kinds: [1, 20], ids: [result.data.id] });
        break;
    }
    return filters;
  } catch {
    // fall through
  }

  try {
    const { pubkey } = await lookupNip05(lookup, c.var);
    if (pubkey) {
      return [{ kinds: [0], authors: [pubkey] }];
    }
  } catch {
    // fall through
  }

  return [];
}

export { searchController };
