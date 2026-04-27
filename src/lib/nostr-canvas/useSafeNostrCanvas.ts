/**
 * Safe access to the nostr-canvas runtime context.
 *
 * The library's own `useNostrCanvas()` throws when called outside a
 * provider — that's inconvenient for us because our provider is
 * lazy-mounted, and we want code like `useTileRegistrations()` to
 * simply see "no tiles" before the runtime is loaded rather than
 * crash.
 *
 * This module pairs two helpers:
 *
 *   - `CanvasMount` — a tiny component, rendered inside the provider,
 *     that imperatively stores the live runtime context value in a
 *     module-level WeakRef-like slot.
 *   - `useSafeNostrCanvas()` — reads the slot synchronously and
 *     returns `undefined` when no provider has mounted yet.
 *
 * This is preferable to wrapping `useNostrCanvas()` in a try/catch
 * because (a) it doesn't violate the Rules of Hooks and (b) it keeps
 * the gate-closed path completely free of library calls, so hydrating
 * Ditto without tiles costs zero.
 */

import {
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  useNostrCanvas,
  type NostrCanvasContextValue,
} from '@soapbox.pub/nostr-canvas/react';

type Listener = () => void;

let currentValue: NostrCanvasContextValue | undefined = undefined;
const listeners = new Set<Listener>();

function setValue(next: NostrCanvasContextValue | undefined): void {
  currentValue = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): NostrCanvasContextValue | undefined {
  return currentValue;
}

/**
 * Render this exactly once inside the library's `NostrCanvasProvider`
 * to expose the runtime context to `useSafeNostrCanvas` consumers
 * throughout the tree.
 *
 * The renderer is wrapped so `useNostrCanvas()` is only called from
 * within a provider — matching React's contract — and the resulting
 * value is published via a plain module-level slot so consumers
 * outside the provider's render tree can read it without triggering
 * the library's "must be inside provider" throw.
 */
export function CanvasMount({ children }: { children?: ReactNode }): ReactNode {
  const value = useNostrCanvas();

  useEffect(() => {
    setValue(value);
    return () => {
      // Only clear if this mount's value is still published. If a new
      // provider has already taken over, leave its value in place.
      if (currentValue === value) setValue(undefined);
    };
  }, [value]);

  return children ?? null;
}

/**
 * Returns the current nostr-canvas runtime context, or `undefined` when
 * no provider is mounted. Re-renders whenever the mount state changes.
 *
 * Unlike the library's `useNostrCanvas`, this never throws.
 */
export function useSafeNostrCanvas(): NostrCanvasContextValue | undefined {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
