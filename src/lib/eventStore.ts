import type { NostrEvent } from '@nostrify/nostrify';

const DB_NAME = 'mew-events';
const DB_VERSION = 1;
const STORE_NAME = 'events';

interface EventWithRelays extends NostrEvent {
  _relays?: string[];
}

class EventStore {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          objectStore.createIndex('pubkey', 'pubkey', { unique: false });
          objectStore.createIndex('kind', 'kind', { unique: false });
          objectStore.createIndex('created_at', 'created_at', { unique: false });
          // Composite index for kind+pubkey queries
          objectStore.createIndex('kind_pubkey', ['kind', 'pubkey'], { unique: false });
        }
      };
    });
  }

  async addEvent(event: NostrEvent, relays: string[]): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);

      // Get existing event to merge relays
      const getRequest = objectStore.get(event.id);

      getRequest.onsuccess = () => {
        const existing = getRequest.result as EventWithRelays | undefined;
        const existingRelays = existing?._relays || [];
        const mergedRelays = Array.from(new Set([...existingRelays, ...relays]));

        const eventWithRelays: EventWithRelays = {
          ...event,
          _relays: mergedRelays,
        };

        const putRequest = objectStore.put(eventWithRelays);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async addEvents(events: NostrEvent[], relays: string[]): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);

      let completed = 0;
      const total = events.length;

      if (total === 0) {
        resolve();
        return;
      }

      events.forEach((event) => {
        const getRequest = objectStore.get(event.id);

        getRequest.onsuccess = () => {
          const existing = getRequest.result as EventWithRelays | undefined;
          const existingRelays = existing?._relays || [];
          const mergedRelays = Array.from(new Set([...existingRelays, ...relays]));

          const eventWithRelays: EventWithRelays = {
            ...event,
            _relays: mergedRelays,
          };

          const putRequest = objectStore.put(eventWithRelays);
          putRequest.onsuccess = () => {
            completed++;
            if (completed === total) resolve();
          };
          putRequest.onerror = () => reject(putRequest.error);
        };

        getRequest.onerror = () => reject(getRequest.error);
      });

      transaction.onerror = () => reject(transaction.error);
    });
  }

  async query(filters: Array<{
    ids?: string[];
    authors?: string[];
    kinds?: number[];
    since?: number;
    until?: number;
    limit?: number;
    [key: string]: unknown;
  }>): Promise<EventWithRelays[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      
      // Get all events and filter in memory
      // For a production app, you'd want to optimize this with proper index usage
      const request = objectStore.getAll();

      request.onsuccess = () => {
        let events = request.result as EventWithRelays[];

        // Apply all filters
        for (const filter of filters) {
          const filteredEvents = events.filter(event => {
            // Filter by IDs
            if (filter.ids && !filter.ids.includes(event.id)) {
              return false;
            }

            // Filter by authors
            if (filter.authors && !filter.authors.includes(event.pubkey)) {
              return false;
            }

            // Filter by kinds
            if (filter.kinds && !filter.kinds.includes(event.kind)) {
              return false;
            }

            // Filter by since (created_at >= since)
            if (filter.since && event.created_at < filter.since) {
              return false;
            }

            // Filter by until (created_at <= until)
            if (filter.until && event.created_at > filter.until) {
              return false;
            }

            // Filter by tag filters (#e, #p, etc.)
            for (const key in filter) {
              if (key.startsWith('#') && Array.isArray(filter[key])) {
                const tagName = key.slice(1);
                const tagValues = filter[key] as string[];
                const hasTag = event.tags.some(
                  ([name, value]) => name === tagName && tagValues.includes(value)
                );
                if (!hasTag) {
                  return false;
                }
              }
            }

            return true;
          });

          events = filteredEvents;
        }

        // Sort by created_at descending
        events.sort((a, b) => b.created_at - a.created_at);

        // Apply limit if specified (use the first filter's limit)
        const limit = filters[0]?.limit;
        if (limit && limit > 0) {
          events = events.slice(0, limit);
        }

        resolve(events);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async getEventById(eventId: string): Promise<EventWithRelays | undefined> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.get(eventId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllEvents(): Promise<EventWithRelays[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getEventsByPubkey(pubkey: string, limit?: number): Promise<EventWithRelays[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      const index = objectStore.index('pubkey');
      const request = index.getAll(pubkey);

      request.onsuccess = () => {
        let results = request.result;
        // Sort by created_at descending
        results.sort((a, b) => b.created_at - a.created_at);
        if (limit) results = results.slice(0, limit);
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getEventsByKindAndPubkey(kind: number, pubkey: string): Promise<EventWithRelays[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      const index = objectStore.index('kind_pubkey');
      const request = index.getAll([kind, pubkey]);

      request.onsuccess = () => {
        const results = request.result;
        // Sort by created_at descending to get the most recent
        results.sort((a, b) => b.created_at - a.created_at);
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteEvent(eventId: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.delete(eventId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getCount(): Promise<number> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async exportToJSONL(): Promise<string> {
    const events = await this.getAllEvents();
    return events.map(event => {
      const { _relays, ...cleanEvent } = event;
      return JSON.stringify(cleanEvent);
    }).join('\n');
  }

  async importFromJSONL(jsonl: string, relays: string[]): Promise<number> {
    const lines = jsonl.trim().split('\n');
    const events: NostrEvent[] = [];

    for (const line of lines) {
      if (line.trim()) {
        try {
          const event = JSON.parse(line);
          events.push(event);
        } catch (error) {
          console.error('Failed to parse event:', error);
        }
      }
    }

    await this.addEvents(events, relays);
    return events.length;
  }

  async clear(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const eventStore = new EventStore();
export type { EventWithRelays };
