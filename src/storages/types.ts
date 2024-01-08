import { type DittoDB } from '@/db.ts';
import { type Event } from '@/deps.ts';
import { type DittoFilter } from '@/filter.ts';
import { type EventData } from '@/types.ts';

/** Additional options to apply to the whole subscription. */
interface GetEventsOpts {
  /** Signal to abort the request. */
  signal?: AbortSignal;
  /** Event limit for the whole subscription. */
  limit?: number;
  /** Relays to use, if applicable. */
  relays?: WebSocket['url'][];
}

/** Options when storing an event. */
interface StoreEventOpts {
  /** Event data to store. */
  data?: EventData;
  /** Relays to use, if applicable. */
  relays?: WebSocket['url'][];
}

type AuthorStats = Omit<DittoDB['author_stats'], 'pubkey'>;
type EventStats = Omit<DittoDB['event_stats'], 'event_id'>;

/** Internal Event representation used by Ditto, including extra keys. */
interface DittoEvent<K extends number = number> extends Event<K> {
  author?: DittoEvent<0>;
  author_stats?: AuthorStats;
  event_stats?: EventStats;
  d_author?: DittoEvent<0>;
  user?: DittoEvent<30361>;
}

/** Storage interface for Nostr events. */
interface EventStore {
  /** Indicates NIPs supported by this data store, similar to NIP-11. For example, `50` would indicate support for `search` filters. */
  supportedNips: readonly number[];
  /** Add an event to the store. */
  add(event: Event, opts?: StoreEventOpts): Promise<void>;
  /** Get events from filters. */
  filter<K extends number>(filters: DittoFilter<K>[], opts?: GetEventsOpts): Promise<DittoEvent<K>[]>;
  /** Get the number of events from filters. */
  count?<K extends number>(filters: DittoFilter<K>[]): Promise<number>;
  /** Delete events from filters. */
  deleteFilters?<K extends number>(filters: DittoFilter<K>[]): Promise<void>;
}

export type { DittoEvent, EventStore, GetEventsOpts, StoreEventOpts };
