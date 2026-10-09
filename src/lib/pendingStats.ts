/**
 * The user's own engagement (reactions, reposts, replies) that the NIP-85
 * stats provider may not have counted yet.
 *
 * Stats come from a provider that recomputes them some time after the fact,
 * so bumping the cached count on a reaction doesn't stick: the next refetch
 * returns the provider's older number. Instead each of the user's actions is
 * recorded here with its `created_at`, and `useEventStats` adds those newer
 * than the stats event (`computedAt`) on top of the provider's count. Once the
 * provider catches up, the action falls at or before `computedAt` and stops
 * being added, so nothing is counted twice.
 */

export type StatField = 'reactionCount' | 'repostCount' | 'commentCount';

interface PendingStat {
  /** The user's event (the reaction, repost, reply, or the deletion undoing one). */
  id: string;
  field: StatField;
  delta: 1 | -1;
  createdAt: number;
}

/** How long a pending action is kept, in seconds — long past any provider lag. */
const MAX_AGE = 24 * 60 * 60;

/** Target (event id or `kind:pubkey:d` address) → actions on it. */
const pending = new Map<string, PendingStat[]>();
const listeners = new Set<() => void>();
let version = 0;

function notify(): void {
  version++;
  for (const listener of listeners) listener();
}

/** Count the user's `event` (a reaction, repost, or reply) toward `target`. */
export function addPendingStat(target: string, field: StatField, event: { id: string; created_at: number }): void {
  const list = pending.get(target) ?? [];
  if (list.some((stat) => stat.id === event.id)) return;
  pending.set(target, [...list, { id: event.id, field, delta: 1, createdAt: event.created_at }]);
  notify();
}

/**
 * Undo the user's `undone` event toward `target`, deleted by `deletion`. If
 * the event is still pending it's simply dropped; otherwise the provider has
 * counted it, so a -1 is recorded until the provider recounts.
 */
export function undoPendingStat(
  target: string,
  field: StatField,
  undone: { id: string },
  deletion: { id: string; created_at: number },
): void {
  const list = pending.get(target) ?? [];
  const next = list.some((stat) => stat.id === undone.id)
    ? list.filter((stat) => stat.id !== undone.id)
    : [...list, { id: deletion.id, field, delta: -1 as const, createdAt: deletion.created_at }];
  if (next.length) pending.set(target, next);
  else pending.delete(target);
  notify();
}

/** The adjustment to `field` of `target`'s stats computed at `computedAt` (0 when there are none). */
export function getPendingDelta(target: string | undefined, field: StatField, computedAt = 0): number {
  if (!target) return 0;
  const now = Math.floor(Date.now() / 1000);
  let sum = 0;
  for (const stat of pending.get(target) ?? []) {
    if (stat.field === field && stat.createdAt > computedAt && now - stat.createdAt < MAX_AGE) sum += stat.delta;
  }
  return sum;
}

/** For `useSyncExternalStore`. */
export function subscribePendingStats(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** For `useSyncExternalStore`: changes whenever pending stats do. */
export function getPendingStatsVersion(): number {
  return version;
}
