import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';

/** Options that pages can set to configure the persistent MainLayout. */
export interface LayoutOptions {
  /** Optional custom right sidebar to replace the default one */
  rightSidebar?: React.ReactNode;
  /** Whether to show the floating compose button (default: false) */
  showFAB?: boolean;
  /** The Nostr event kind the FAB creates (default: 1). Only used when showFAB is true. */
  fabKind?: number;
  /** If set, the FAB navigates to this URL instead of opening a compose dialog. */
  fabHref?: string;
  /** If set, overrides the default FAB click behavior. */
  onFabClick?: () => void;
  /** If set, overrides the default FAB icon (Plus). */
  fabIcon?: React.ReactNode;
  /** Additional classes for the wrapper div */
  wrapperClassName?: string;
  /**
   * Optional scroll container element for the MobileBottomNav hide-on-scroll
   * behavior. Pages that scroll an internal container (e.g. Vines snap-scroll)
   * should set this so the bottom nav detects scroll direction correctly.
   */
  scrollContainer?: HTMLElement | null;
  /**
   * If true, disables the bottom overscroll padding on the center column.
   * Use for pages with fixed-height layouts (chat, vines, livestream, etc.)
   * that manage their own scroll containers.
   */
  noOverscroll?: boolean;
  /**
   * If true, removes the max-width constraint on the center column so it
   * expands to fill available space. Use with `rightSidebar: null` for
   * full-width page layouts (e.g. messaging).
   */
  noMaxWidth?: boolean;
  /**
   * If true, indicates the page renders its own sub-header with a decorative
   * arc (e.g. tab bars). The mobile top bar will skip its own arc to avoid
   * doubling up.
   */
  hasSubHeader?: boolean;
  /**
   * If true, all decorative arcs are replaced with plain rectangles on the
   * mobile top bar, bottom nav, and sub-header. Use for immersive pages
   * (e.g. vines) where curved chrome interferes with full-bleed content.
   */
  noArcs?: boolean;
}

type Listener = () => void;

const EMPTY: LayoutOptions = {};

/**
 * A mutable store that holds the current layout options.
 * Pages call `setOptions` to update, and MainLayout subscribes via useSyncExternalStore.
 */
export class LayoutStore {
  private options: LayoutOptions = EMPTY;
  private listeners = new Set<Listener>();

  getSnapshot = (): LayoutOptions => this.options;

  getOptions = (): LayoutOptions => this.options;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setOptions = (next: LayoutOptions): void => {
    if (this.options === next) return;
    this.options = next;
    this.listeners.forEach((l) => l());
  };

  reset = (): void => {
    if (this.options === EMPTY) return;
    this.options = EMPTY;
    this.listeners.forEach((l) => l());
  };
}

export const LayoutStoreContext = createContext<LayoutStore | null>(null);

/** Context for exposing the scroll-direction hidden state to child components (MobileTopBar, SubHeaderBar). */
export const NavHiddenContext = createContext<boolean>(false);

/** Hook to read whether the top nav should be hidden due to scroll direction. */
export function useNavHidden(): boolean {
  return useContext(NavHiddenContext);
}

function useLayoutStore(): LayoutStore {
  const store = useContext(LayoutStoreContext);
  if (!store) throw new Error('useLayoutOptions must be used within LayoutStoreContext');
  return store;
}

/**
 * Hook for pages to declare their layout options.
 * Call this at the top of a page component to configure the surrounding MainLayout.
 *
 * Sets options synchronously during render so the layout never shows stale values.
 * Resets to defaults on unmount so options don't leak to the next page.
 */
export function useLayoutOptions(options: LayoutOptions): void {
  const store = useLayoutStore();
  const prev = useRef<LayoutOptions | null>(null);

  // Set options synchronously during render (before commit) so the layout
  // picks them up in the same paint as the new page.
  const changed =
    prev.current === null ||
    prev.current.showFAB !== options.showFAB ||
    prev.current.fabKind !== options.fabKind ||
    prev.current.fabHref !== options.fabHref ||
    prev.current.onFabClick !== options.onFabClick ||
    prev.current.fabIcon !== options.fabIcon ||
    prev.current.wrapperClassName !== options.wrapperClassName ||
    prev.current.rightSidebar !== options.rightSidebar ||
    prev.current.scrollContainer !== options.scrollContainer ||
    prev.current.noOverscroll !== options.noOverscroll ||
    prev.current.noMaxWidth !== options.noMaxWidth ||
    prev.current.hasSubHeader !== options.hasSubHeader ||
    prev.current.noArcs !== options.noArcs;

  if (changed) {
    prev.current = options;
    store.setOptions(options);
  }

  // Clean up on unmount — reset to defaults so the next page starts fresh.
  // Only reset if the store still holds this component's options.
  // During page transitions the new page's render-phase setOptions runs
  // before the old page's cleanup effect, so blindly resetting would
  // clobber the incoming page's options (causing the FAB to disappear).
  useEffect(() => {
    return () => {
      if (store.getOptions() === prev.current) {
        store.reset();
      }
    };
  }, [store]);
}

/** Hook for MainLayout to read the current layout options reactively. */
export function useLayoutSnapshot(): LayoutOptions {
  const store = useLayoutStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
