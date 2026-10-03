import { useCallback, useSyncExternalStore } from 'react';

/**
 * Posts whose held media the viewer chose to load this session, by event id.
 *
 * Module state rather than component state so a reveal survives the card
 * remounting (virtualized feeds, navigating to the detail page and back) and
 * applies everywhere the same post renders. Memory only: a reload asks again.
 */
const revealed = new Set<string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Load this post's held media wherever it renders, for the rest of the session. */
export function revealMedia(eventId: string): void {
  if (revealed.has(eventId)) return;
  revealed.add(eventId);
  for (const listener of listeners) listener();
}

/** Whether the viewer has loaded this post's held media this session. */
export function useMediaRevealed(eventId: string | undefined): boolean {
  const get = useCallback(() => (eventId ? revealed.has(eventId) : false), [eventId]);
  return useSyncExternalStore(subscribe, get, get);
}
