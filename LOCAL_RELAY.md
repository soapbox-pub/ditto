# Local Relay (IndexedDB Cache)

Mew includes a local relay system that caches Nostr events in IndexedDB for instant loading and offline access.

## How It Works

### Architecture

The local relay is built using three main components:

1. **EventStore** (`src/lib/eventStore.ts`) - IndexedDB wrapper for storing and querying events
2. **LocalRelay** (`src/lib/LocalRelay.ts`) - Relay interface implementation that queries IndexedDB
3. **NostrProvider Integration** - Automatically includes the local relay in all queries

### Automatic Caching

Events are automatically cached to IndexedDB in two ways:

1. **Query Results** - When you query relays, the local relay is included and returns cached events instantly
2. **Published Events** - When you publish events, they're automatically stored locally via the `eventRouter`

### Query Flow

When you query events with `nostr.query()`:

1. The query is routed to the local relay (`local://indexeddb`) AND remote relays
2. Local relay responds immediately with cached events from IndexedDB
3. Remote relays respond with fresh events from the network
4. Results are deduplicated by event ID
5. New events from remote relays are automatically cached locally for future queries

This means you get:
- **Instant results** from the local cache
- **Fresh data** from remote relays
- **Offline access** to previously cached events

### Event Syncing

You can use the `useEventSync` hook to automatically sync events to the local cache:

```typescript
import { useEventSync } from '@/hooks/useEventSync';

function MyComponent() {
  // Sync posts from users you follow
  useEventSync({
    filters: [
      { kinds: [1], authors: followingPubkeys, limit: 100 }
    ],
    interval: 30000, // Sync every 30 seconds
    onNewEvents: (count) => {
      console.log(`Synced ${count} new events`);
    }
  });

  // ...rest of component
}
```

## Settings UI

The local cache is displayed in **Settings > Relays** with:

- **Event count** - Total number of cached events
- **Export** - Download all cached events as JSONL
- **Import** - Import events from a JSONL file
- **Clear** - Delete all cached events

## IndexedDB Schema

Database: `mew-events`

Store: `events`

Indexes:
- `id` (primary key)
- `pubkey`
- `kind`
- `created_at`
- `kind_pubkey` (composite)

Each event is stored with an additional `_relays` property that tracks which relays the event was found on.

## Performance

The local relay provides significant performance benefits:

1. **Zero network latency** - IndexedDB queries are instant
2. **Reduced bandwidth** - Cached events don't need to be re-fetched
3. **Offline support** - View cached content without internet connection
4. **Faster EOSE** - Queries resolve quickly with local results while waiting for remote relays

## API Reference

### EventStore Methods

```typescript
// Initialize the database
await eventStore.init();

// Add a single event
await eventStore.addEvent(event, ['wss://relay.example.com']);

// Add multiple events
await eventStore.addEvents(events, ['wss://relay.example.com']);

// Query events with filters
const events = await eventStore.query([
  { kinds: [1], authors: [pubkey], limit: 20 }
]);

// Get event by ID
const event = await eventStore.getEventById(eventId);

// Get all events
const allEvents = await eventStore.getAllEvents();

// Get events by pubkey
const userEvents = await eventStore.getEventsByPubkey(pubkey, 100);

// Get events by kind and pubkey
const notes = await eventStore.getEventsByKindAndPubkey(1, pubkey);

// Delete an event
await eventStore.deleteEvent(eventId);

// Get total event count
const count = await eventStore.getCount();

// Export to JSONL
const jsonl = await eventStore.exportToJSONL();

// Import from JSONL
const importedCount = await eventStore.importFromJSONL(jsonl, ['local-import']);

// Clear all events
await eventStore.clear();
```

### LocalRelay Interface

```typescript
import { localRelay } from '@/lib/LocalRelay';

// Query events
const events = await localRelay.query([{ kinds: [1], limit: 20 }]);

// Add an event
await localRelay.event(event);

// Subscribe to events
for await (const event of localRelay.req([{ kinds: [1] }])) {
  console.log(event);
}
```

## Implementation Notes

- The local relay URL is `local://indexeddb` (shown in settings)
- Events are deduplicated by ID when merging results
- Relay metadata (`_relays`) tracks which relays have seen each event
- The local relay is always included in `reqRouter` for every query
- Published events are automatically stored via `eventRouter`
- The `eoseTimeout` of 500ms ensures queries resolve quickly once any relay (including local) responds

## Comparison to mi

This implementation is inspired by the local event storage system in the `mi` project, with the following differences:

1. **Automatic integration** - The local relay is transparently integrated into the NPool, so all queries automatically include it
2. **Relay interface** - Implements a full relay interface rather than just a storage layer
3. **Composite indexes** - Includes a `kind_pubkey` composite index for more efficient queries
4. **UI integration** - Displays cache status and management in the relay settings

The key advantage is that you don't need to explicitly query the event store - it's automatically queried as part of every `nostr.query()` call, providing instant results from the cache while simultaneously fetching fresh data from remote relays.
