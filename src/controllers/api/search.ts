import { AppController } from '@/app.ts';
import * as eventsDB from '@/db/events.ts';
import { type Event, type Filter, nip19, z } from '@/deps.ts';
import * as mixer from '@/mixer.ts';
import { lookupNip05Cached } from '@/nip05.ts';
import { booleanParamSchema } from '@/schema.ts';
import { toAccount, toStatus } from '@/transformers/nostr-to-mastoapi.ts';
import { dedupeEvents, Time } from '@/utils.ts';

/** Matches NIP-05 names with or without an @ in front. */
const ACCT_REGEX = /^@?(?:([\w.+-]+)@)?([\w.-]+)$/;

const searchQuerySchema = z.object({
  q: z.string().transform(decodeURIComponent),
  type: z.enum(['accounts', 'statuses', 'hashtags']).optional(),
  resolve: booleanParamSchema.optional().transform(Boolean),
  following: z.boolean().default(false),
  account_id: z.string().optional(),
  limit: z.coerce.number().catch(20).transform((value) => Math.min(Math.max(value, 0), 40)),
});

type SearchQuery = z.infer<typeof searchQuerySchema>;

const searchController: AppController = async (c) => {
  const result = searchQuerySchema.safeParse(c.req.query());

  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 422);
  }

  const { q, type, limit } = result.data;

  const [event, events] = await Promise.all([
    lookupEvent(result.data),
    !type || type === 'statuses' ? eventsDB.getFilters<number>([{ kinds: [1], search: q, limit }]) : [] as Event[],
  ]);

  if (event) {
    events.push(event);
  }

  const results = dedupeEvents(events);

  const [accounts, statuses] = await Promise.all([
    Promise.all(
      results
        .filter((event): event is Event<0> => event.kind === 0)
        .map((event) => toAccount(event)),
    ),
    Promise.all(
      results
        .filter((event): event is Event<1> => event.kind === 1)
        .map((event) => toStatus(event, c.get('pubkey'))),
    ),
  ]);

  return c.json({
    accounts: accounts.filter(Boolean),
    statuses: statuses.filter(Boolean),
    hashtags: [],
  });
};

/** Resolve a searched value into an event, if applicable. */
async function lookupEvent(query: SearchQuery): Promise<Event | undefined> {
  const filters = await getLookupFilters(query);
  const [event] = await mixer.getFilters(filters, { limit: 1, timeout: Time.seconds(1) });
  return event;
}

/** Get filters to lookup the input value. */
async function getLookupFilters({ q, type, resolve }: SearchQuery): Promise<Filter[]> {
  const filters: Filter[] = [];

  if (!resolve || type === 'hashtags') {
    return filters;
  }

  if (new RegExp(`^${nip19.BECH32_REGEX.source}$`).test(q)) {
    try {
      const result = nip19.decode(q);
      switch (result.type) {
        case 'npub':
          filters.push({ kinds: [0], authors: [result.data] });
          break;
        case 'nprofile':
          filters.push({ kinds: [0], authors: [result.data.pubkey] });
          break;
        case 'note':
          filters.push({ kinds: [1], ids: [result.data] });
          break;
        case 'nevent':
          filters.push({ kinds: [1], ids: [result.data.id] });
          break;
      }
    } catch (_e) {
      // do nothing
    }
  } else if (/^[0-9a-f]{64}$/.test(q)) {
    filters.push({ kinds: [0], authors: [q] });
    filters.push({ kinds: [1], ids: [q] });
  } else if ((!type || type === 'accounts') && ACCT_REGEX.test(q)) {
    const pubkey = await lookupNip05Cached(q);
    if (pubkey) {
      filters.push({ kinds: [0], authors: [pubkey] });
    }
  }

  if (!type) {
    return filters;
  }

  return filters.filter(({ kinds }) => {
    switch (type) {
      case 'accounts':
        return kinds?.every((kind) => kind === 0);
      case 'statuses':
        return kinds?.every((kind) => kind === 1);
    }
  });
}

export { searchController };
