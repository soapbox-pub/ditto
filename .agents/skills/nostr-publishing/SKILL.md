---
name: nostr-publishing
description: Publish Nostr events with useNostrPublish. Covers the basic publishing pattern, safely mutating replaceable and addressable events (read-modify-write via fetchFreshEvent + prev), published_at preservation, and d-tag collision prevention for new addressable content.
---

# Publishing Nostr Events

Use this skill when a feature needs to publish events — notes, reactions, list updates, profile edits, addressable content, etc. Covers the `useNostrPublish` hook, the correct read-modify-write pattern for replaceable/addressable lists, and d-tag collision prevention.

## The `useNostrPublish` Hook

`useNostrPublish` publishes an event through the app's connection pool and auto-adds a `client` tag. Always guard calls with `useCurrentUser` — publishing requires a signer.

```tsx
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';

export function PostForm() {
  const { user } = useCurrentUser();
  const { mutate: createEvent } = useNostrPublish();

  if (!user) return <span>You must be logged in to post.</span>;

  return (
    <button onClick={() => createEvent({ kind: 1, content: 'hello' })}>
      Post
    </button>
  );
}
```

Prefer `mutateAsync` over `mutate` when the caller needs to `await` the published event (e.g. to navigate to the new event's page, or to chain another publish).

## Mutating Replaceable and Addressable Events (CRITICAL)

Replaceable (kind 10000-19999) and addressable (kind 30000-39999) events require a **read-modify-write** cycle: fetch the current event, modify its tags, publish a new version. **Never read from the TanStack Query cache before mutating** — the cache can be stale from another device or a rapid prior operation, and republishing stale data silently drops the user's data.

Use `fetchFreshEvent()` from `src/lib/fetchFreshEvent.ts` inside every mutation, and **always pass the fetched event as `prev`** so `useNostrPublish` can preserve `published_at`:

```typescript
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';

// Inside a mutation function:
const prev = await fetchFreshEvent(nostr, {
  kinds: [10003],
  authors: [user.pubkey],
});
const currentTags = prev?.tags ?? [];
// ...modify tags...
await publishEvent({
  kind: 10003,
  content: prev?.content ?? '',
  tags: newTags,
  prev: prev ?? undefined,
});
```

This applies to all list-type hooks (bookmarks, pins, interests, follow sets, badges, etc.). See `useFollowActions` and `useMuteList` for complete examples.

### The `prev` Property on Event Templates

`useNostrPublish` accepts an optional `prev` property on the event template — the **previous version** of the event being replaced. The hook uses it to manage the `published_at` tag (NIP-24) automatically:

- **First publish (no `prev`)** — `published_at` is set equal to `created_at`.
- **Update (`prev` provided)** — `published_at` is preserved from the old event.
- **Old event lacks `published_at`** — nothing is fabricated.
- **Caller already set `published_at` in tags** — left alone.

**Convention**: name the local variable `prev` at the call site (not `freshEvent` or `latestEvent`) so it reads naturally when passed to `publishEvent`:

```typescript
const prev = await fetchFreshEvent(nostr, { kinds: [3], authors: [user.pubkey] });
// ...
await publishEvent({ kind: 3, content: prev?.content ?? '', tags: newTags, prev: prev ?? undefined });
```

`prev` is stripped from the template before signing — it never appears in the published Nostr event.

## D-Tag Collision Prevention for Addressable Events

Addressable events (kind 30000-39999) are identified by `pubkey + kind + d-tag`. Publishing an event with the same d-tag as an existing one **silently replaces** it. This is by design for intentional updates (edit flows), but dangerous when creating *new* content with user-derived d-tags (slugs from titles, user-entered identifiers, etc.).

### When to check for collisions

- **Must check** when the d-tag is derived from user input (slugified titles, user-entered identifiers, etc.).
- **No check needed** when the d-tag is a `crypto.randomUUID()`, a canonical format with an embedded pubkey prefix, or intentionally the same as an existing event (edit/update flows).

### Implementation pattern

Before publishing a **new** addressable event with a user-derived d-tag, query for an existing event with that d-tag. If one exists, block the publish and tell the user to change the identifier.

```typescript
// Before publishing a new addressable event:
const slug = slugify(title, { lower: true, strict: true });

const existing = await nostr.query([
  { kinds: [30023], authors: [user.pubkey], '#d': [slug], limit: 1 },
]);

if (existing.length > 0) {
  toast({
    title: 'Slug already in use',
    description: 'Change the slug or edit the existing item.',
    variant: 'destructive',
  });
  return;
}

// Safe to publish
publishEvent({ kind: 30023, content, tags: [['d', slug], ...otherTags] });
```

**Skip the check in edit mode** — when the user explicitly loaded an existing event to update, overwriting is the intended behavior.

Prefer UUID or canonical formats when the d-tag doesn't need to be human-readable. Only use slugified input when the d-tag will appear in URLs or needs to be meaningful to users, and always add a collision check.
