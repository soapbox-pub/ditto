# Local Relay (IndexedDB Cache)

Mew includes a local relay system that caches Nostr events in IndexedDB for instant loading and offline access.

## How It Works

### Architecture

The local relay is built using three main components:

1. **EventStore** (`src/lib/eventStore.ts`) - IndexedDB wrapper for storing and querying events
2. **LocalRelay** (`src/lib/LocalRelay.ts`) - Relay interface implementation that queries IndexedDB
3. **NostrProvider Integration** - Automatically includes the local relay in all queries

### Automatic Caching

Events are automatically cached to IndexedDB as they stream in from the network:

1. **Incoming Events** - All events received from remote relays are automatically cached as they arrive
2. **Published Events** - When you publish events, they're automatically stored locally via the `eventRouter`
3. **No Syncing Required** - The cache builds naturally as you use the app, no background syncing needed

### Query Flow

When you query events with `nostr.query()`:

1. The query is routed to the local relay (`local://indexeddb`) AND remote relays
2. Local relay responds immediately with cached events from IndexedDB
3. Remote relays stream fresh events from the network
4. **Each event from remote relays is automatically cached as it arrives**
5. Results are deduplicated by event ID

This means you get:
- **Instant results** from the local cache
- **Fresh data** from remote relays
- **Automatic caching** of all events you encounter
- **Offline access** to previously viewed content

### Streaming Cache Updates

The NostrProvider intercepts the event stream from each relay and caches events in real-time:

```typescript
// In NostrProvider - automatically happens for every query
relay.req = async function* (filters, opts) {
  for await (const event of originalReq(filters, opts)) {
    // Cache each event as it streams in (fire and forget)
    eventStore.addEvent(event, [url]);
    yield event;
  }
};
```

This means:
- Posts are cached when you view the feed
- Profiles are cached when you view author info
- Replies are cached when you open a thread
- No manual syncing required - the cache builds as you browse

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

This implementation is inspired by the local event storage system in the `mi` project, with the following key differences:

1. **Automatic integration** - The local relay is transparently integrated into the NPool, so all queries automatically include it
2. **Relay interface** - Implements a full relay interface rather than just a storage layer
3. **Streaming cache** - Events are cached in real-time as they stream in from relays, not via polling/syncing
4. **Composite indexes** - Includes a `kind_pubkey` composite index for more efficient queries
5. **UI integration** - Displays cache status and management in the relay settings

The key advantages:
- **Zero configuration** - You don't need to explicitly query the event store or set up syncing
- **Real-time caching** - Events are cached as they arrive, building the cache organically as you use the app
- **Instant loads on refresh** - Profiles and posts load instantly from cache while fresh data streams in from relays
- **No background syncing** - No polling intervals or sync hooks needed, everything happens naturally
