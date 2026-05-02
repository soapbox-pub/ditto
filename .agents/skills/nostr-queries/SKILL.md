---
name: nostr-queries
description: Query Nostr events efficiently with useNostr + TanStack Query. Covers the standard useQuery pattern, combining related kinds into a single request to avoid rate limiting, and validating events with required tags or strict schemas.
---

# Querying Nostr Events

Use this skill when building a hook that fetches Nostr events. Covers the standard `useNostr` + `useQuery` pattern, efficient query design (combining kinds to avoid relay round-trips), and event validation for kinds with required tags.

## The Standard Pattern

Combine `useNostr` with TanStack Query in a custom hook. Pass the abort signal from `c.signal` into `nostr.query` so cancelled queries free relay resources:

```typescript
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

function usePosts() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['posts'],
    queryFn: async (c) => {
      const events = await nostr.query(
        [{ kinds: [1], limit: 20 }],
        { signal: c.signal },
      );
      return events;
    },
  });
}
```

Transform events into a domain model inside the `queryFn` if needed — callers should rarely see raw `NostrEvent`s. Multiple calls to `nostr.query()` inside one `queryFn` are fine for compound queries that can't be expressed as a single filter.

## Efficient Query Design

**Always minimize the number of separate round-trips** to relays. Each query consumes relay capacity and may count against rate limits.

**✅ Efficient — single query with multiple kinds:**

```typescript
// Query repost variants in one request
const events = await nostr.query([{
  kinds: [1, 6, 16],
  '#e': [eventId],
  limit: 150,
}]);

// Separate by kind in JavaScript
const notes = events.filter((e) => e.kind === 1);
const reposts = events.filter((e) => e.kind === 6);
const genericReposts = events.filter((e) => e.kind === 16);
```

**❌ Inefficient — three separate round-trips:**

```typescript
const [notes, reposts, genericReposts] = await Promise.all([
  nostr.query([{ kinds: [1], '#e': [eventId] }]),
  nostr.query([{ kinds: [6], '#e': [eventId] }]),
  nostr.query([{ kinds: [16], '#e': [eventId] }]),
]);
```

### Optimization rules

1. **Combine kinds** into one filter: `kinds: [1, 6, 16]`.
2. **Use multiple filter objects** in a single `nostr.query()` call when different tag filters are needed simultaneously.
3. **Raise the `limit`** when combining kinds so you still receive enough of each type.
4. **Split by kind in JavaScript**, not by making separate requests.
5. **Respect relay capacity** — heavy parallel queries can trigger rate limits even when each individually would be fine.

## Event Validation

For kinds with required tags or strict schemas (most custom kinds, anything beyond kind 1), filter query results through a validator before returning them. Loose kinds (kind 1 text notes) rarely need validation — all tags are optional and `content` is freeform.

```typescript
import type { NostrEvent } from '@nostrify/nostrify';

// Example validator for NIP-52 calendar events
function validateCalendarEvent(event: NostrEvent): boolean {
  if (![31922, 31923].includes(event.kind)) return false;

  const d = event.tags.find(([n]) => n === 'd')?.[1];
  const title = event.tags.find(([n]) => n === 'title')?.[1];
  const start = event.tags.find(([n]) => n === 'start')?.[1];
  if (!d || !title || !start) return false;

  // Date-based events require YYYY-MM-DD
  if (event.kind === 31922 && !/^\d{4}-\d{2}-\d{2}$/.test(start)) return false;

  // Time-based events require a unix timestamp
  if (event.kind === 31923) {
    const ts = parseInt(start);
    if (isNaN(ts) || ts <= 0) return false;
  }

  return true;
}

function useCalendarEvents() {
  const { nostr } = useNostr();
  return useQuery({
    queryKey: ['calendar-events'],
    queryFn: async (c) => {
      const events = await nostr.query(
        [{ kinds: [31922, 31923], limit: 20 }],
        { signal: c.signal },
      );
      return events.filter(validateCalendarEvent);
    },
  });
}
```

Validation is a correctness layer, not a security layer. For trust-sensitive queries (admin actions, addressable events, moderator approvals), also constrain `authors` — see the `nostr-security` skill.
