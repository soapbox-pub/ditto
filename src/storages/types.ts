import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { type DittoFilter } from '@/interfaces/DittoFilter.ts';

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
  /** Relays to use, if applicable. */
  relays?: WebSocket['url'][];
}

/** Storage interface for Nostr events. */
interface EventStore {
  /** Indicates NIPs supported by this data store, similar to NIP-11. For example, `50` would indicate support for `search` filters. */
  supportedNips: readonly number[];
  /** Add an event to the store. */
  add(event: DittoEvent, opts?: StoreEventOpts): Promise<void>;
  /** Get events from filters. */
  filter(filters: DittoFilter[], opts?: GetEventsOpts): Promise<DittoEvent[]>;
  /** Get the number of events from filters. */
  count?(filters: DittoFilter[]): Promise<number>;
  /** Delete events from filters. */
  deleteFilters?(filters: DittoFilter[]): Promise<void>;
}

export type { EventStore, GetEventsOpts, StoreEventOpts };
