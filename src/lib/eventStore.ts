import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

const DB_NAME = 'mew-events';
const DB_VERSION = 3; // Increment to force migration from broken v2

// Separate stores for different event types (like Jumble does)
const StoreNames = {
  PROFILES: 'profiles',           // kind 0 - keyed by pubkey
  CONTACTS: 'contacts',            // kind 3 - keyed by pubkey
  RELAY_LISTS: 'relayLists',      // kind 10002 - keyed by pubkey
  EVENTS: 'events',                // all other events - keyed by event.id
} as const;

interface EventWithRelays extends NostrEvent {
  _relays?: string[];
}

interface EventRecord {
  event: EventWithRelays;
  relays: string[];
}

class EventStoreV2 {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.debug('[EventStoreV2] Database initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create profiles store (kind 0) - keyed by pubkey
        if (!db.objectStoreNames.contains(StoreNames.PROFILES)) {
          db.createObjectStore(StoreNames.PROFILES, { keyPath: 'event.pubkey' });
        }

        // Create contacts store (kind 3) - keyed by pubkey
        if (!db.objectStoreNames.contains(StoreNames.CONTACTS)) {
          db.createObjectStore(StoreNames.CONTACTS, { keyPath: 'event.pubkey' });
        }

        // Create relay lists store (kind 10002) - keyed by pubkey
        if (!db.objectStoreNames.contains(StoreNames.RELAY_LISTS)) {
          db.createObjectStore(StoreNames.RELAY_LISTS, { keyPath: 'event.pubkey' });
        }

        // Create events store (all other events) - keyed by event.id
        if (!db.objectStoreNames.contains(StoreNames.EVENTS)) {
          const eventsStore = db.createObjectStore(StoreNames.EVENTS, { keyPath: 'event.id' });
          eventsStore.createIndex('createdAtIndex', 'event.created_at');
          eventsStore.createIndex('pubkeyIndex', 'event.pubkey');
          eventsStore.createIndex('kindIndex', 'event.kind');
        }
      };
    });

    return this.initPromise;
  }

  async addEvent(event: NostrEvent, relays: string[]): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const storeName = this.getStoreName(event.kind);
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      const key = this.getKey(event);
      const getRequest = store.get(key);

      getRequest.onsuccess = () => {
        const existing = getRequest.result as EventRecord | undefined;
        
        // For replaceable events, only update if newer
        if (existing && this.isReplaceableKind(event.kind)) {
          if (existing.event.created_at >= event.created_at) {
            resolve();
            return;
          }
        }

        const existingRelays = existing?.relays || [];
        const mergedRelays = Array.from(new Set([...existingRelays, ...relays]));

        const record: EventRecord = {
          event: { ...event, _relays: mergedRelays },
          relays: mergedRelays,
        };

        const putRequest = store.put(record);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async addEvents(events: NostrEvent[], relays: string[]): Promise<void> {
    await this.init();

    // Group events by kind to minimize transaction overhead
    const eventsByKind = new Map<number, NostrEvent[]>();
    for (const event of events) {
      const kind = event.kind;
      if (!eventsByKind.has(kind)) {
        eventsByKind.set(kind, []);
      }
      eventsByKind.get(kind)!.push(event);
    }

    // Process each kind group
    for (const [kind, kindEvents] of eventsByKind) {
      const storeName = this.getStoreName(kind);
      await new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);

        let completed = 0;
        const total = kindEvents.length;

        for (const event of kindEvents) {
          const key = this.getKey(event);
          const getRequest = store.get(key);

          getRequest.onsuccess = () => {
            const existing = getRequest.result as EventRecord | undefined;
            
            // For replaceable events, only update if newer
            if (existing && this.isReplaceableKind(event.kind)) {
              if (existing.event.created_at >= event.created_at) {
                completed++;
                if (completed === total) resolve();
                return;
              }
            }

            const existingRelays = existing?.relays || [];
            const mergedRelays = Array.from(new Set([...existingRelays, ...relays]));

            const record: EventRecord = {
              event: { ...event, _relays: mergedRelays },
              relays: mergedRelays,
            };

            const putRequest = store.put(record);
            putRequest.onsuccess = () => {
              completed++;
              if (completed === total) resolve();
            };
            putRequest.onerror = () => reject(putRequest.error);
          };

          getRequest.onerror = () => reject(getRequest.error);
        }
      });
    }
  }

  async query(filters: NostrFilter[]): Promise<EventWithRelays[]> {
    await this.init();
    const startTime = performance.now();

    const results: EventWithRelays[] = [];
    const seenIds = new Set<string>();

    for (const filter of filters) {
      const events = await this.queryFilter(filter);
      for (const event of events) {
        if (!seenIds.has(event.id)) {
          seenIds.add(event.id);
          results.push(event);
        }
      }
    }

    // Sort by created_at descending
    results.sort((a, b) => b.created_at - a.created_at);

    // Apply limit
    const limit = filters[0]?.limit;
    const limited = limit ? results.slice(0, limit) : results;

    const duration = performance.now() - startTime;
    console.debug(`[EventStoreV2] Query completed in ${duration.toFixed(2)}ms, found ${limited.length} events`);

    return limited;
  }

  /**
   * Batch-fetch profiles for multiple pubkeys (like Jumble's getManyReplaceableEvents)
   * This is MUCH faster than separate queries per pubkey
   */
  async getManyProfiles(pubkeys: string[]): Promise<(EventWithRelays | null)[]> {
    await this.init();
    const startTime = performance.now();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([StoreNames.PROFILES], 'readonly');
      const store = transaction.objectStore(StoreNames.PROFILES);
      
      const results: (EventWithRelays | null)[] = new Array(pubkeys.length).fill(null);
      let completed = 0;

      pubkeys.forEach((pubkey, i) => {
        const request = store.get(pubkey);
        
        request.onsuccess = () => {
          const record = request.result as EventRecord | undefined;
          results[i] = record?.event || null;
          
          completed++;
          if (completed === pubkeys.length) {
            const duration = performance.now() - startTime;
            console.debug(`[EventStoreV2] Batch profile query for ${pubkeys.length} pubkeys in ${duration.toFixed(2)}ms`);
            resolve(results);
          }
        };
        
        request.onerror = () => {
          completed++;
          if (completed === pubkeys.length) {
            resolve(results);
          }
        };
      });
    });
  }

  private async queryFilter(filter: NostrFilter): Promise<EventWithRelays[]> {
    // Optimize for common queries
    if (filter.kinds?.length === 1 && filter.kinds[0] === 0 && filter.authors?.length === 1) {
      // Profile query - direct lookup
      return this.queryProfiles(filter.authors);
    }

    if (filter.kinds?.length === 1 && filter.kinds[0] === 3 && filter.authors?.length === 1) {
      // Contacts query - direct lookup
      return this.queryContacts(filter.authors);
    }

    if (filter.kinds?.length === 1 && filter.kinds[0] === 10002 && filter.authors?.length === 1) {
      // Relay list query - direct lookup
      return this.queryRelayLists(filter.authors);
    }

    // General query using cursor
    return this.queryCursor(filter);
  }

  private async queryProfiles(pubkeys: string[]): Promise<EventWithRelays[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([StoreNames.PROFILES], 'readonly');
      const store = transaction.objectStore(StoreNames.PROFILES);
      const results: EventWithRelays[] = [];

      let completed = 0;
      for (const pubkey of pubkeys) {
        const request = store.get(pubkey);
        request.onsuccess = () => {
          const record = request.result as EventRecord | undefined;
          if (record) results.push(record.event);
          completed++;
          if (completed === pubkeys.length) resolve(results);
        };
        request.onerror = () => {
          completed++;
          if (completed === pubkeys.length) resolve(results);
        };
      }
    });
  }

  private async queryContacts(pubkeys: string[]): Promise<EventWithRelays[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([StoreNames.CONTACTS], 'readonly');
      const store = transaction.objectStore(StoreNames.CONTACTS);
      const results: EventWithRelays[] = [];

      let completed = 0;
      for (const pubkey of pubkeys) {
        const request = store.get(pubkey);
        request.onsuccess = () => {
          const record = request.result as EventRecord | undefined;
          if (record) results.push(record.event);
          completed++;
          if (completed === pubkeys.length) resolve(results);
        };
        request.onerror = () => {
          completed++;
          if (completed === pubkeys.length) resolve(results);
        };
      }
    });
  }

  private async queryRelayLists(pubkeys: string[]): Promise<EventWithRelays[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([StoreNames.RELAY_LISTS], 'readonly');
      const store = transaction.objectStore(StoreNames.RELAY_LISTS);
      const results: EventWithRelays[] = [];

      let completed = 0;
      for (const pubkey of pubkeys) {
        const request = store.get(pubkey);
        request.onsuccess = () => {
          const record = request.result as EventRecord | undefined;
          if (record) results.push(record.event);
          completed++;
          if (completed === pubkeys.length) resolve(results);
        };
        request.onerror = () => {
          completed++;
          if (completed === pubkeys.length) resolve(results);
        };
      }
    });
  }

  private async queryCursor(filter: NostrFilter): Promise<EventWithRelays[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([StoreNames.EVENTS], 'readonly');
      const store = transaction.objectStore(StoreNames.EVENTS);
      const index = store.index('createdAtIndex');
      
      // Use cursor in reverse order (newest first)
      const request = index.openCursor(null, 'prev');
      const results: EventWithRelays[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        
        if (cursor && (!filter.limit || results.length < filter.limit)) {
          const record = cursor.value as EventRecord;
          if (this.matchesFilter(record.event, filter)) {
            results.push(record.event);
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  private matchesFilter(event: EventWithRelays, filter: NostrFilter): boolean {
    if (filter.ids && !filter.ids.includes(event.id)) return false;
    if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
    if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
    if (filter.since && event.created_at < filter.since) return false;
    if (filter.until && event.created_at > filter.until) return false;

    // Tag filters
    for (const key in filter) {
      if (key.startsWith('#')) {
        const tagName = key.slice(1);
        const tagValues = (filter as any)[key] as string[];
        const hasTag = event.tags.some(
          ([name, value]) => name === tagName && tagValues.includes(value)
        );
        if (!hasTag) return false;
      }
    }

    return true;
  }

  private getStoreName(kind: number): string {
    if (kind === 0) return StoreNames.PROFILES;
    if (kind === 3) return StoreNames.CONTACTS;
    if (kind === 10002) return StoreNames.RELAY_LISTS;
    return StoreNames.EVENTS;
  }

  private getKey(event: NostrEvent): string | IDBValidKey {
    const storeName = this.getStoreName(event.kind);
    
    // For stores that use pubkey as key
    if (storeName === StoreNames.PROFILES || 
        storeName === StoreNames.CONTACTS || 
        storeName === StoreNames.RELAY_LISTS) {
      return event.pubkey;
    }
    
    // For events store, use event.id
    return event.id;
  }

  private isReplaceableKind(kind: number): boolean {
    return kind === 0 || kind === 3 || kind === 10002 || (kind >= 10000 && kind < 20000);
  }

  async getCount(): Promise<number> {
    await this.init();
    
    const stores = [StoreNames.PROFILES, StoreNames.CONTACTS, StoreNames.RELAY_LISTS, StoreNames.EVENTS];
    const transaction = this.db!.transaction(stores, 'readonly');
    
    const counts = await Promise.all(stores.map(storeName => {
      return new Promise<number>((resolve) => {
        const store = transaction.objectStore(storeName);
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(0);
      });
    }));
    
    return counts.reduce((a, b) => a + b, 0);
  }

  async clear(): Promise<void> {
    await this.init();
    
    const stores = [StoreNames.PROFILES, StoreNames.CONTACTS, StoreNames.RELAY_LISTS, StoreNames.EVENTS];
    const transaction = this.db!.transaction(stores, 'readwrite');
    
    await Promise.all(stores.map(storeName => {
      return new Promise<void>((resolve, reject) => {
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }));
  }

  async exportToJSONL(): Promise<string> {
    await this.init();
    
    const stores = [StoreNames.PROFILES, StoreNames.CONTACTS, StoreNames.RELAY_LISTS, StoreNames.EVENTS];
    const allEvents: NostrEvent[] = [];
    
    for (const storeName of stores) {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      
      const records = await new Promise<EventRecord[]>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      
      for (const record of records) {
        const { _relays, ...event } = record.event;
        allEvents.push(event as NostrEvent);
      }
    }
    
    return allEvents.map(event => JSON.stringify(event)).join('\n');
  }

  async importFromJSONL(jsonl: string, relays: string[]): Promise<number> {
    const lines = jsonl.trim().split('\n');
    const events: NostrEvent[] = [];

    for (const line of lines) {
      if (line.trim()) {
        try {
          events.push(JSON.parse(line));
        } catch (error) {
          console.error('Failed to parse event:', error);
        }
      }
    }

    await this.addEvents(events, relays);
    return events.length;
  }
}

export const eventStore = new EventStoreV2();
export type { EventWithRelays };
