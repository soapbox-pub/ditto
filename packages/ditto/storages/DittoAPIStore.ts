import type {
  NostrEvent,
  NostrFilter,
  NostrRelayCLOSED,
  NostrRelayCOUNT,
  NostrRelayEOSE,
  NostrRelayEVENT,
  NRelay,
} from '@nostrify/nostrify';

export class DittoAPIStore implements NRelay {
  req(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    throw new Error('Method not implemented.');
  }

  close(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void> {
    throw new Error('Method not implemented.');
  }

  query(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrEvent[]> {
    throw new Error('Method not implemented.');
  }

  count(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrRelayCOUNT[2]> {
    throw new Error('Method not implemented.');
  }

  remove(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
