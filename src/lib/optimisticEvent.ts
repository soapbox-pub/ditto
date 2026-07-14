import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Helpers for optimistically updating the TanStack Query cache after a Nostr
 * publish, so the UI reflects the user's action immediately instead of waiting
 * for the relay round-trip. Each helper snapshots the prior value and returns
 * it so the caller can roll back on error.
 *
 * These target the common Ditto pattern of a *replaceable* event (kind 0,
 * 10000–19999, 30000–39999) cached as a single `NostrEvent | null` under a
 * query key, where derived UI state (isPinned/isBookmarked/hasInterest/...)
 * reads from the event's tags.
 */

/** Build a synthetic replaceable event so derived state flips even when no cached event exists yet. */
function syntheticEvent(kind: number, pubkey: string, tags: string[][], content: string): NostrEvent {
  return {
    id: '',
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind,
    tags,
    content,
    sig: '',
  };
}

/**
 * Optimistically replace the tags of a cached replaceable event.
 *
 * `transform` receives the current tags (empty array if no event is cached)
 * and returns the new tags. When no event exists yet, a synthetic one is
 * created so derived checks (e.g. `isPinned`) flip immediately.
 *
 * @returns the prior cached value, for rollback via {@link rollbackEvent}.
 */
export function optimisticPatchEventTags(
  queryClient: QueryClient,
  queryKey: QueryKey,
  opts: { kind: number; pubkey: string; transform: (tags: string[][]) => string[][] },
): NostrEvent | null | undefined {
  const snapshot = queryClient.getQueryData<NostrEvent | null>(queryKey);
  const currentTags = snapshot?.tags ?? [];
  const newTags = opts.transform(currentTags);
  const base = snapshot ?? syntheticEvent(opts.kind, opts.pubkey, [], '');
  queryClient.setQueryData<NostrEvent | null>(queryKey, { ...base, tags: newTags });
  return snapshot;
}

/** Restore a snapshot captured by an optimistic helper (used in a mutation's `onError`). */
export function rollbackEvent(
  queryClient: QueryClient,
  queryKey: QueryKey,
  snapshot: NostrEvent | null | undefined,
): void {
  rollbackQuery(queryClient, queryKey, snapshot);
}

/**
 * Restore a cached query value to a snapshot, handling the `undefined` case
 * correctly.
 *
 * `setQueryData(key, undefined)` is a no-op in TanStack Query — `undefined` is
 * the "don't change" sentinel. So a snapshot of `undefined` (the key held
 * nothing before the optimistic write) must remove the query outright,
 * otherwise the optimistic value lingers after a failed publish. Every
 * optimistic mutation's `onError` should roll back through this rather than
 * calling `setQueryData` directly.
 */
export function rollbackQuery<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  snapshot: T | undefined,
): void {
  if (snapshot === undefined) {
    queryClient.removeQueries({ queryKey, exact: true });
  } else {
    queryClient.setQueryData<T>(queryKey, snapshot);
  }
}

/**
 * Toggle a single-value tag (e.g. `['e', id]`) in a replaceable event's tags:
 * remove it if the (name, value) pair is present, otherwise append it.
 */
export function toggleTag(tags: string[][], name: string, value: string): string[][] {
  const present = tags.some(([n, v]) => n === name && v === value);
  return present
    ? tags.filter(([n, v]) => !(n === name && v === value))
    : [...tags, [name, value]];
}
