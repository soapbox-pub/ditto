/**
 * TourAnchorContext - Registry for UI anchor elements.
 *
 * UI components register their DOM elements by anchor ID. The tour
 * overlay reads these to position the guide, highlights, and modals
 * relative to real page elements.
 *
 * Usage in an anchor component:
 * ```tsx
 * const { registerAnchor } = useTourAnchors();
 * <div ref={(el) => registerAnchor('bar-item-0', el)}>...</div>
 * ```
 *
 * Usage in the tour overlay:
 * ```tsx
 * const { getAnchorRect } = useTourAnchors();
 * const rect = getAnchorRect('bar-item-0'); // DOMRect | null
 * ```
 */

import { createContext, useContext, useCallback, useRef, type ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TourAnchorContextValue {
  /** Register or update an anchor element. Pass null to unregister. */
  registerAnchor: (id: string, element: HTMLElement | null) => void;
  /** Get the current bounding rect for an anchor. Returns null if not registered. */
  getAnchorRect: (id: string) => DOMRect | null;
  /** Get the raw element for an anchor. Returns null if not registered. */
  getAnchorElement: (id: string) => HTMLElement | null;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const TourAnchorCtx = createContext<TourAnchorContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function TourAnchorProvider({ children }: { children: ReactNode }) {
  const anchorsRef = useRef<Map<string, HTMLElement>>(new Map());

  const registerAnchor = useCallback((id: string, element: HTMLElement | null) => {
    if (element) {
      anchorsRef.current.set(id, element);
    } else {
      anchorsRef.current.delete(id);
    }
  }, []);

  const getAnchorRect = useCallback((id: string): DOMRect | null => {
    const el = anchorsRef.current.get(id);
    return el ? el.getBoundingClientRect() : null;
  }, []);

  const getAnchorElement = useCallback((id: string): HTMLElement | null => {
    return anchorsRef.current.get(id) ?? null;
  }, []);

  return (
    <TourAnchorCtx.Provider value={{ registerAnchor, getAnchorRect, getAnchorElement }}>
      {children}
    </TourAnchorCtx.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTourAnchors(): TourAnchorContextValue {
  const ctx = useContext(TourAnchorCtx);
  if (!ctx) {
    throw new Error('useTourAnchors must be used within a TourAnchorProvider');
  }
  return ctx;
}
