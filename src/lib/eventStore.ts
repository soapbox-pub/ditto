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

    const startTime = performance.now();

    // For simplicity and reliability, use a single transaction and collect all matching events
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      
      const allEvents: EventWithRelays[] = [];
      const seenIds = new Set<string>();

      if (filters.length === 0) {
        resolve([]);
        return;
      }

      // Process each filter
      let pendingOperations = 0;
      let hasError = false;

      const checkComplete = () => {
        if (pendingOperations === 0 && !hasError) {
          const duration = performance.now() - startTime;
          const filterDesc = filters.map(f => {
            const parts = [];
            if (f.kinds) parts.push(`kinds:${f.kinds.join(',')}`);
            if (f.authors) parts.push(`authors:${f.authors.length}`);
            if (f.ids) parts.push(`ids:${f.ids.length}`);
            if (f.limit) parts.push(`limit:${f.limit}`);
            return parts.join(' ');
          }).join(' | ');
          console.debug(`[EventStore] Query [${filterDesc}] completed in ${duration.toFixed(2)}ms, found ${allEvents.length} events`);
          this.finalizeQueryResults(allEvents, filters[0]?.limit, resolve);
        }
      };

      for (const filter of filters) {
        // Optimize common query patterns
        if (filter.kinds && filter.kinds.length > 0 && filter.authors && filter.authors.length > 0) {
          // Use composite index for kind+author (most common feed query)
          for (const kind of filter.kinds) {
            for (const author of filter.authors) {
              pendingOperations++;
              const index = objectStore.index('kind_pubkey');
              const range = IDBKeyRange.only([kind, author]);
              const request = index.getAll(range);
              
              request.onsuccess = () => {
                const events = request.result as EventWithRelays[];
                for (const event of events) {
                  if (!seenIds.has(event.id) && this.matchesFilter(event, filter)) {
                    seenIds.add(event.id);
                    allEvents.push(event);
                  }
                }
                pendingOperations--;
                checkComplete();
              };
              
              request.onerror = () => {
                hasError = true;
                reject(request.error);
              };
            }
          }
        } else if (filter.ids && filter.ids.length > 0) {
          // Query by IDs directly
          for (const id of filter.ids) {
            pendingOperations++;
            const request = objectStore.get(id);
            
            request.onsuccess = () => {
              if (request.result) {
                const event = request.result as EventWithRelays;
                if (!seenIds.has(event.id) && this.matchesFilter(event, filter)) {
                  seenIds.add(event.id);
                  allEvents.push(event);
                }
              }
              pendingOperations--;
              checkComplete();
            };
            
            request.onerror = () => {
              hasError = true;
              reject(request.error);
            };
          }
        } else {
          // Fallback: load all events and filter
          pendingOperations++;
          const request = objectStore.getAll();
          
          request.onsuccess = () => {
            const events = request.result as EventWithRelays[];
            for (const event of events) {
              if (!seenIds.has(event.id) && this.matchesFilter(event, filter)) {
                seenIds.add(event.id);
                allEvents.push(event);
              }
            }
            pendingOperations--;
            checkComplete();
          };
          
          request.onerror = () => {
            hasError = true;
            reject(request.error);
          };
        }
      }

      // If no async operations were queued, resolve immediately
      if (pendingOperations === 0) {
        this.finalizeQueryResults(allEvents, filters[0]?.limit, resolve);
      }
    });
  }

  private matchesFilter(event: EventWithRelays, filter: {
    ids?: string[];
    authors?: string[];
    kinds?: number[];
    since?: number;
    until?: number;
    [key: string]: unknown;
  }): boolean {
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
  }

  private finalizeQueryResults(
    events: EventWithRelays[],
    limit: number | undefined,
    resolve: (value: EventWithRelays[]) => void
  ): void {
    // Sort by created_at descending
    events.sort((a, b) => b.created_at - a.created_at);

    // Apply limit if specified
    if (limit && limit > 0) {
      events = events.slice(0, limit);
    }

    resolve(events);
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
