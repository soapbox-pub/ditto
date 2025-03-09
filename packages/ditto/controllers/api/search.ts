import { paginated, paginatedList } from '@ditto/mastoapi/pagination';
import { NostrEvent, NostrFilter, NSchema as n } from '@nostrify/nostrify';
import { z } from 'zod';

import { AppContext, AppController } from '@/app.ts';
import { booleanParamSchema } from '@/schema.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { extractIdentifier, lookupEvent, lookupPubkey } from '@/utils/lookup.ts';
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

  if (!c.var.pool) {
    throw new Error('Ditto pool not available');
  }

  const event = await lookupEvent(result.data.q, { ...c.var, pool: c.var.pool });
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
    events = await hydrateEvents({ ...c.var, events: [event] });
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

export { searchController };
