import { AppController } from '@/app.ts';
import * as eventsDB from '@/db/events.ts';
import { type Event, nip05, nip19 } from '@/deps.ts';
import * as mixer from '@/mixer.ts';
import { lookupNip05Cached } from '@/nip05.ts';
import { getAuthor } from '@/queries.ts';
import { toAccount, toStatus } from '@/transformers/nostr-to-mastoapi.ts';
import { bech32ToPubkey, dedupeEvents, Time } from '@/utils.ts';
import { paginationSchema } from '@/utils/web.ts';

const searchController: AppController = async (c) => {
  const q = c.req.query('q');
  const params = paginationSchema.parse(c.req.query());

  if (!q) {
    return c.json({ error: 'Missing `q` query parameter.' }, 422);
  }

  const [event, events] = await Promise.all([
    lookupEvent(decodeURIComponent(q)),
    eventsDB.getFilters<number>([{ kinds: [1], search: q, ...params }]),
  ]);

  if (event) {
    events.push(event);
  }

  const results = dedupeEvents(events);

  const accounts = await Promise.all(
    results
      .filter((event): event is Event<0> => event.kind === 0)
      .map((event) => toAccount(event)),
  );

  const statuses = await Promise.all(
    results
      .filter((event): event is Event<1> => event.kind === 1)
      .map((event) => toStatus(event, c.get('pubkey'))),
  );

  return c.json({
    accounts: accounts.filter(Boolean),
    statuses: statuses.filter(Boolean),
    hashtags: [],
  });
};

/** Resolve a searched value into an event, if applicable. */
async function lookupEvent(value: string): Promise<Event<0 | 1> | undefined> {
  if (new RegExp(`^${nip19.BECH32_REGEX.source}$`).test(value)) {
    const pubkey = bech32ToPubkey(value);
    if (pubkey) {
      return getAuthor(pubkey);
    }
  } else if (/^[0-9a-f]{64}$/.test(value)) {
    const [event] = await mixer.getFilters(
      [{ kinds: [0], authors: [value], limit: 1 }, { kinds: [1], ids: [value], limit: 1 }],
      { limit: 1, timeout: Time.seconds(1) },
    );
    return event;
  } else if (nip05.NIP05_REGEX.test(value)) {
    const pubkey = await lookupNip05Cached(value);
    if (pubkey) {
      return getAuthor(pubkey);
    }
  }
}

export { searchController };
