/**
 * Lazy root for the nostr-canvas runtime.
 *
 * This component sits inside `MainLayout` and is always present in the
 * render tree, but it does not mount the real `NostrCanvasProvider` (and
 * therefore does not pull in the ~500 KB `wasmoon` WASM) until the
 * canvas gate is requested.
 *
 * When any consumer calls `useCanvasGate().requestGate()`, the state
 * flips to open and a lazy-imported `NostrCanvasRuntimeProvider` mounts.
 * While the chunk is loading, children still render — the runtime just
 * isn't available yet — so page content doesn't flash.
 *
 * Before the gate opens, `useSafeNostrCanvas()` returns `undefined`,
 * `useTileRegistrations()` returns empty arrays, and the feed/widget
 * code paths fall back to Ditto's native renderers.
 */

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';

import {
  CanvasGateProvider,
  type CanvasGate,
} from '@/lib/nostr-canvas/canvasGate';
import { useAppContext } from '@/hooks/useAppContext';

// The provider pulls in wasmoon (large WASM blob). Lazy so it only loads
// after the gate opens.
const NostrCanvasRuntimeProvider = lazy(
  () => import('@/components/nostr-canvas/NostrCanvasProvider'),
);

interface LazyNostrCanvasRootProps {
  children: ReactNode;
}

/**
 * Decide whether the canvas gate should open automatically based on
 * ambient app state: the current URL path, whether the user has any
 * installed tiles, and whether any widget slot is configured as a tile
 * widget. Returning `true` from any of these fires `requestGate()`.
 */
function useAutoGate(): boolean {
  const { config } = useAppContext();
  const location = useLocation();

  // Any tile-related route forces the gate open.
  if (location.pathname.startsWith('/tiles')) return true;

  // Any installed tile => we need the runtime to register it so its
  // feed-rendering and nav-item contributions are visible.
  if ((config.installedTiles?.length ?? 0) > 0) return true;

  // Any sidebar widget of type 'tile' needs the runtime.
  if (
    (config.sidebarWidgets ?? []).some(
      (w) => w.id === 'tile' && w.tileIdentifier,
    )
  ) {
    return true;
  }

  return false;
}

export function LazyNostrCanvasRoot({
  children,
}: LazyNostrCanvasRootProps): ReactNode {
  const [gateOpen, setGateOpen] = useState(false);

  const requestGate = useCallback(() => {
    setGateOpen((prev) => (prev ? prev : true));
  }, []);

  const autoGate = useAutoGate();
  useEffect(() => {
    if (autoGate) requestGate();
  }, [autoGate, requestGate]);

  const gate = useMemo<CanvasGate>(
    () => ({ gateOpen, requestGate }),
    [gateOpen, requestGate],
  );

  return (
    <CanvasGateProvider value={gate}>
      {gateOpen
        ? (
          <Suspense fallback={children}>
            <NostrCanvasRuntimeProvider>{children}</NostrCanvasRuntimeProvider>
          </Suspense>
        )
        : children}
    </CanvasGateProvider>
  );
}
