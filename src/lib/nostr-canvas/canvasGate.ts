/**
 * Canvas gate — controls whether the nostr-canvas runtime is loaded.
 *
 * The `wasmoon` WebAssembly Lua runtime is ~500 KB, so we refuse to load
 * it until something in the tree actually needs it. The gate is a small
 * context that exposes:
 *
 *   - `gateOpen`   — whether the real runtime provider has been mounted
 *   - `requestGate()` — call this to flip the gate on (idempotent)
 *
 * Consumers that can operate without the runtime (e.g. the feed and
 * widget sidebar, which both query the "do any tiles want to render this
 * kind?" list) check the gate before subscribing to registrations; if
 * the gate is closed, they see an empty list and render with their
 * native fallbacks.
 *
 * The gate flips on when:
 *   1. The user navigates to any `/tiles/*` route,
 *   2. The widget sidebar renders a tile widget, or
 *   3. The user has installed tiles with active feed registrations the
 *      first time the feed mounts.
 */

import { createContext, useContext } from 'react';

export interface CanvasGate {
  gateOpen: boolean;
  requestGate: () => void;
}

const CanvasGateContext = createContext<CanvasGate>({
  gateOpen: false,
  requestGate: () => {},
});

export const CanvasGateProvider = CanvasGateContext.Provider;

/** Read the current canvas gate. Safe to call from any component. */
export function useCanvasGate(): CanvasGate {
  return useContext(CanvasGateContext);
}
