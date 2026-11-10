import { useSyncExternalStore } from 'react';
import type { Location } from 'react-router-dom';

/**
 * The in-app history entries seen this session, by history index, so the
 * page behind the current one is known (see `BackSwipe`). Entries from
 * before a reload, or behind the entry the app was opened on, are unknown.
 */
const entries: (Location | undefined)[] = [];
let current = 0;
const listeners = new Set<() => void>();

function indexOfState(): number {
  const state: unknown = window.history.state;
  return typeof state === 'object' && state !== null && typeof (state as { idx?: unknown }).idx === 'number'
    ? (state as { idx: number }).idx
    : 0;
}

/** Record the entry now on screen, after a navigation of `action`. */
export function recordHistoryEntry(location: Location, action: 'POP' | 'PUSH' | 'REPLACE'): void {
  const idx = indexOfState();
  // A push drops the entries it replaced going forward.
  if (action === 'PUSH') entries.length = idx;
  entries[idx] = location;
  current = idx;
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function previous(): Location | undefined {
  return current > 0 ? entries[current - 1] : undefined;
}

/** The in-app entry going back would land on, if this session has seen it. */
export function usePreviousHistoryEntry(): Location | undefined {
  return useSyncExternalStore(subscribe, previous, () => undefined);
}
