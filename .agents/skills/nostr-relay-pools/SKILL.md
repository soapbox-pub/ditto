---
name: nostr-relay-pools
description: Query or publish to specific Nostr relays or curated relay groups using nostr.relay() and nostr.group(), instead of the default connection pool. Useful for debugging, testing, specialized relays, or geographically-targeted publishing.
---

# Targeted Nostr Relay Connections

By default, the `nostr` object returned from `useNostr` uses the app's connection pool: it reads from one of the configured relays and publishes to all of them. For most features this is exactly what you want.

Use this skill when you need **more granular control** — talking to a single relay, a curated group of relays, or debugging a specific relay's behavior.

## Single Relay: `nostr.relay(url)`

```ts
import { useNostr } from '@nostrify/react';

function useSpecificRelay() {
  const { nostr } = useNostr();

  // Connect to a specific relay
  const relay = nostr.relay('wss://relay.damus.io');

  // Query from this relay only
  const events = await relay.query([{ kinds: [1], limit: 15 }]);

  // Publish to this relay only
  await relay.event({ kind: 1, content: 'Hello from a specific relay!' });
}
```

**Good fits:**

- Testing a relay's behavior in isolation
- Debugging connectivity or rate-limiting issues
- Querying content that only lives on a specialized relay (paid relays, private relays, niche communities)
- Health checks / admin tooling

## Relay Group: `nostr.group(urls)`

```ts
import { useNostr } from '@nostrify/react';

function useRelayGroup() {
  const { nostr } = useNostr();

  // Create a group of specific relays
  const relayGroup = nostr.group([
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://nos.lol',
  ]);

  // Query from all relays in the group (deduplicated)
  const events = await relayGroup.query([{ kinds: [1], limit: 15 }]);

  // Publish to all relays in the group
  await relayGroup.event({ kind: 1, content: 'Hello from a relay group!' });
}
```

**Good fits:**

- Publishing to a curated set of trusted relays for a specific feature
- Community-scoped queries (e.g. a set of relays known to host a particular topic)
- Geographic/region-targeted delivery
- Load-balancing reads across a known-good subset

## API Consistency

Both the `relay` object and the `group` object expose the **same interface** as the top-level `nostr` object:

- `.query(filters, opts?)` — request events matching filters
- `.req(filters, opts?)` — open a streaming subscription
- `.event(event)` — publish a signed event
- All other Nostrify methods

This means you can drop them into any existing hook or helper that expects a `nostr`-shaped object.

## Choosing Between Pool, Group, and Single Relay

| Scenario                                           | Use                 |
|----------------------------------------------------|---------------------|
| Default app queries, best reach for publishing     | `nostr` (pool)      |
| Trusted subset, community-specific publishing      | `nostr.group([…])`  |
| Single-relay debugging or specialized relay access | `nostr.relay(url)`  |

## Tips

- **Don't hard-code user-facing relay lists.** If a feature should publish to "the user's write relays", read from `AppContext.config.relayMetadata` (NIP-65) instead of hard-coding URLs.
- **Compose with TanStack Query.** Wrap `relay.query(...)` / `group.query(...)` inside a `useQuery` hook exactly as you would with the default `nostr` object; the caching layer is identical.
- **Handle unreachable relays.** Specific relays can be offline, rate-limited, or slow. Always wrap calls in `try/catch` and respect the abort signal from the query function (`c.signal`).
- **Avoid leaking subscriptions.** When using `.req(...)` for streaming, always close the subscription on unmount (`controller.abort()` or the returned disposer).
