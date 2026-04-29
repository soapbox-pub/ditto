---
name: nip85-stats
description: Fetch pre-computed engagement stats (follower count, post count, reply count, reaction count, zap amounts, etc.) for users, events, and addressable events via a NIP-85 Trusted Assertion provider. Provides useNip85UserStats, useNip85EventStats, and useNip85AddrStats hooks backed by a configurable provider pubkey in AppConfig.
---

# NIP-85 Trusted Assertion Stats

[NIP-85](https://github.com/nostr-protocol/nips/blob/master/85.md) defines "Trusted Assertions" — events published by a service provider that carry pre-computed stats (follower counts, reaction counts, zap totals, etc.) for users and events. Clients that would otherwise need to load thousands of events to compute these numbers can instead query a single addressable event from a trusted provider.

This skill adds three hooks — `useNip85UserStats`, `useNip85EventStats`, `useNip85AddrStats` — and a configurable `nip85StatsPubkey` field on `AppConfig` so you can swap providers.

## Kinds Used

| Kind  | Subject                      | `d` tag value              |
| ----- | ---------------------------- | -------------------------- |
| 30382 | User                         | user pubkey (hex)          |
| 30383 | Event (regular, kind 1 etc.) | event id (hex)             |
| 30384 | Addressable event            | `<kind>:<pubkey>:<d-tag>`  |

The hooks query one replaceable event at a time (`limit: 1`), filtered by `authors: [statsPubkey]` and `#d`. **Filtering by `authors` is required** — without it, anyone could publish a fake assertion with the same `d` tag and the client would accept it.

## Files Provided by This Skill

| Skill file | Copy to |
|---|---|
| `files/hooks/useNip85Stats.ts` | `src/hooks/useNip85Stats.ts` |

## Setup Instructions

### 1. Copy the Hooks File

Copy `.agents/skills/nip85-stats/files/hooks/useNip85Stats.ts` into `src/hooks/useNip85Stats.ts`. It imports `@nostrify/react`, `@tanstack/react-query`, and `@/hooks/useAppContext`, all already present in the template.

### 2. Add `nip85StatsPubkey` to `AppConfig`

In `src/contexts/AppContext.ts`, add the field to the `AppConfig` interface:

```typescript
export interface AppConfig {
  // ...existing fields...
  /** Hex pubkey of the NIP-85 Trusted Assertion provider. Empty = disabled. */
  nip85StatsPubkey: string;
}
```

### 3. Update the Zod Schema in `AppProvider.tsx`

In `src/components/AppProvider.tsx`, add the field to `AppConfigSchema`:

```typescript
const AppConfigSchema = z.object({
  // ...existing fields...
  nip85StatsPubkey: z.string().refine(
    (val) => val.length === 0 || /^[0-9a-f]{64}$/i.test(val),
    { message: 'Must be empty or a 64-character hex pubkey' },
  ),
}) satisfies z.ZodType<AppConfig>;
```

### 4. Set the Default in `App.tsx`

Pick a provider pubkey and add it to `defaultConfig`. The ditto.pub provider is a reasonable default:

```typescript
const defaultConfig: AppConfig = {
  // ...existing fields...
  nip85StatsPubkey: '5f68e85ee174102ca8978eef302129f081f03456c884185d5ec1c1224ab633ea',
};
```

Set to `''` to ship with stats disabled.

### 5. Update `TestApp.tsx`

In `src/test/TestApp.tsx`, add the field to the test default config. Use an empty string so tests don't hit a live provider:

```typescript
const defaultConfig: AppConfig = {
  // ...existing fields...
  nip85StatsPubkey: '',
};
```

## Usage

### User stats (kind 30382)

```tsx
import { useNip85UserStats } from '@/hooks/useNip85Stats';

function FollowerCount({ pubkey }: { pubkey: string }) {
  const { data: stats } = useNip85UserStats(pubkey);
  if (!stats) return null; // no provider configured or no assertion yet
  return <span>{stats.followers.toLocaleString()} followers</span>;
}
```

### Event stats (kind 30383)

```tsx
import { useNip85EventStats } from '@/hooks/useNip85Stats';

function NoteStats({ eventId }: { eventId: string }) {
  const { data: stats } = useNip85EventStats(eventId);
  if (!stats) return null;
  return (
    <div className="flex gap-3 text-sm text-muted-foreground">
      <span>{stats.reactionCount} reactions</span>
      <span>{stats.repostCount} reposts</span>
      <span>{stats.commentCount} comments</span>
      <span>{stats.zapAmount} sats</span>
    </div>
  );
}
```

### Addressable event stats (kind 30384)

The `addr` argument is the full NIP-01 event address `<kind>:<pubkey>:<d-tag>`:

```tsx
import { useNip85AddrStats } from '@/hooks/useNip85Stats';

function ArticleStats({ kind, pubkey, identifier }: { kind: number; pubkey: string; identifier: string }) {
  const { data: stats } = useNip85AddrStats(`${kind}:${pubkey}:${identifier}`);
  if (!stats) return null;
  return <span>{stats.reactionCount} reactions</span>;
}
```

## Behavior Notes

- **Graceful degradation:** The hooks return `null` (not an error) when `nip85StatsPubkey` is empty or the provider has no assertion for the subject. Always render defensively — NIP-85 is an optimization, not a source of truth.
- **Short timeouts:** Each query is wrapped in a 2-second `AbortSignal.timeout` so a slow stats relay never blocks the UI.
- **Cached by TanStack Query:** `staleTime` is 30s for event/addr stats and 60s for user stats. Results are keyed on `[kind, subject, statsPubkey]`, so swapping providers invalidates the cache automatically.
- **Missing tags = 0:** A tag absent from the assertion is reported as `0` rather than `undefined`, matching NIP-85's "no data" semantics.
- **Not the source of truth:** For interactive features (did *this* user like *this* post?) you still need to query the underlying reaction/zap/repost events. NIP-85 only provides aggregate counts.

## Extending the Stats

The hooks expose a small subset of the tags defined in NIP-85. To surface more (e.g. `zap_amt_sent`, `rank`, `first_created_at`), extend the return types and pull additional tags via `getIntTag`:

```typescript
export interface Nip85UserStats {
  followers: number;
  postCount: number;
  rank: number;            // new
  zapAmtReceived: number;  // new
}

// inside useNip85UserStats queryFn
return {
  followers: getIntTag(tags, 'followers'),
  postCount: getIntTag(tags, 'post_cnt'),
  rank: getIntTag(tags, 'rank'),
  zapAmtReceived: getIntTag(tags, 'zap_amt_recd'),
};
```

See the full tag table in [NIP-85](https://github.com/nostr-protocol/nips/blob/master/85.md).

## Exposing a Provider Picker (Optional)

If you want the user to change providers at runtime, add an input bound to `config.nip85StatsPubkey` and call `updateConfig` with a validated 64-char hex value:

```tsx
import { useAppContext } from '@/hooks/useAppContext';

function StatsProviderInput() {
  const { config, updateConfig } = useAppContext();
  return (
    <input
      value={config.nip85StatsPubkey}
      onChange={(e) => {
        const v = e.target.value.trim().toLowerCase();
        if (v === '' || /^[0-9a-f]{64}$/.test(v)) {
          updateConfig(() => ({ nip85StatsPubkey: v }));
        }
      }}
      placeholder="64-char hex pubkey (blank to disable)"
    />
  );
}
```

## Related NIPs

- [NIP-85](https://github.com/nostr-protocol/nips/blob/master/85.md) — Trusted Assertions (this skill)
- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) — Addressable event addressing (`<kind>:<pubkey>:<d-tag>`)
- [NIP-57](https://github.com/nostr-protocol/nips/blob/master/57.md) — Zaps (the underlying events `zap_amount` / `zap_cnt` aggregate)
