import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { eventStore } from './eventStore';

/**
 * LocalRelay implements a Nostr relay interface backed by IndexedDB.
 * This allows querying locally cached events without network requests.
 */
export class LocalRelay {
  readonly url = 'local://indexeddb';

  async query(filters: NostrFilter[]): Promise<NostrEvent[]> {
    try {
      const events = await eventStore.query(filters);
      // Remove the _relays property before returning
      return events.map(({ _relays, ...event }) => event as NostrEvent);
    } catch (error) {
      console.error('[LocalRelay] Query error:', error);
      return [];
    }
  }

  async event(event: NostrEvent): Promise<void> {
    try {
      await eventStore.addEvent(event, ['local://indexeddb']);
    } catch (error) {
      console.error('[LocalRelay] Event storage error:', error);
    }
  }

  async *req(filters: NostrFilter[]): AsyncGenerator<NostrEvent> {
    try {
      const events = await this.query(filters);
      for (const event of events) {
        yield event;
      }
    } catch (error) {
      console.error('[LocalRelay] Subscription error:', error);
    }
  }

  // Mock methods to satisfy relay interface
  async connect(): Promise<void> {
    // IndexedDB is always "connected"
  }

  async close(): Promise<void> {
    // No-op for IndexedDB
  }
}

export const localRelay = new LocalRelay();
