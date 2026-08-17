/**
 * Emit a DOM event whenever the browser history changes.
 *
 * React Router v7 wraps every navigation in `React.startTransition`, so the
 * committed React location (what `useLocation` returns) only updates *after*
 * the destination route is render-ready. That's the whole point of the
 * transition — but it means the previous page stays on screen with no feedback
 * while a heavy route (e.g. the feed) becomes ready, which reads as a freeze.
 *
 * To surface that in-flight window we need a signal at the *start* of a
 * navigation, before the transition commits. React Router updates
 * `window.history` synchronously (via the `history` package) before kicking off
 * the transition, so patching `pushState`/`replaceState` to emit an event gives
 * us exactly that edge. The committed `useLocation` change marks the end.
 *
 * The patch preserves the original behavior and only appends an event dispatch,
 * so it's transparent to React Router and any other history consumer.
 */

const HISTORY_EVENT = 'ditto:historychange';

let patched = false;

/** Wrap `history.pushState`/`replaceState` once so they emit {@link HISTORY_EVENT}. */
function ensurePatched(): void {
  if (patched || typeof window === 'undefined' || !window.history) return;
  patched = true;

  const methods = ['pushState', 'replaceState'] as const;
  for (const method of methods) {
    const original = window.history[method];
    window.history[method] = function (
      this: History,
      ...args: Parameters<History['pushState']>
    ): void {
      original.apply(this, args);
      window.dispatchEvent(new Event(HISTORY_EVENT));
    };
  }
}

/**
 * Subscribe to browser history changes — both programmatic
 * (`pushState`/`replaceState`, i.e. React Router link navigation) and
 * back/forward (`popstate`). Returns an unsubscribe function.
 */
export function onHistoryChange(listener: () => void): () => void {
  ensurePatched();
  window.addEventListener(HISTORY_EVENT, listener);
  window.addEventListener('popstate', listener);
  return () => {
    window.removeEventListener(HISTORY_EVENT, listener);
    window.removeEventListener('popstate', listener);
  };
}
