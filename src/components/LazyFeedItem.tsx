import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * How far beyond the viewport (px, each direction) items mount.
 * Generous enough that normal scrolling never shows an unmounted card,
 * small enough that a long session doesn't keep hundreds of cards live.
 */
const MOUNT_MARGIN_PX = 2000;

/**
 * How far beyond the viewport a mounted item must get before it unmounts.
 * Wider than {@link MOUNT_MARGIN_PX} so the two don't fight: an item mounts at
 * the margin's edge alongside its neighbours, and as their placeholders give
 * way to real (usually taller) cards it is pushed back out. With one margin it
 * unmounted there and remounted on the next scroll step — a scroll profile
 * threw away 28 of 72 NoteCard mounts within 150ms, each one starting and
 * aborting its queries and NIP-05 fetches.
 */
const UNMOUNT_MARGIN_PX = 3000;

/**
 * Fallback placeholder height before an item has ever been measured.
 * Matches the `contain-intrinsic-size: auto 300px` estimate used by the
 * `cv-feed-item` content-visibility rule in index.css.
 */
const ESTIMATED_HEIGHT_PX = 300;

/** Upper bound on remembered heights so a long session can't grow unbounded. */
const MAX_CACHED_HEIGHTS = 2000;

/**
 * Last measured height per `cacheKey`, surviving component remounts.
 *
 * A feed unmounts entirely when the user opens a post, so without this every
 * item past the initial batch comes back as a 300px placeholder. The list is
 * then the wrong height, a restored scroll offset lands on the wrong card,
 * and the page reflows as the observer swaps placeholders for real cards.
 * Seeding placeholders from their previous height makes the remounted list
 * match the one the user left.
 *
 * The cached height must also feed `contain-intrinsic-size` on the wrapper.
 * `content-visibility: auto` sizes a skipped (off-screen) element from that
 * property alone and ignores its children, so a placeholder div of the right
 * height inside a skipped wrapper still lays out at the 300px class default.
 * The `auto` keyword's remembered size lives on the DOM node and is lost on
 * remount, so the inline value is the only thing that survives.
 */
const heightCache = new Map<string, number>();

function rememberHeight(key: string | undefined, height: number): void {
  if (!key || height <= 0) return;
  heightCache.delete(key);
  heightCache.set(key, height);
  if (heightCache.size > MAX_CACHED_HEIGHTS) {
    const oldest = heightCache.keys().next().value;
    if (oldest !== undefined) heightCache.delete(oldest);
  }
}

type VisibilityCallback = (entry: IntersectionObserverEntry) => void;

/**
 * One shared IntersectionObserver per margin for every feed item, instead of
 * observers per item. Callbacks are looked up per element.
 */
interface SharedObserver {
  observer: IntersectionObserver;
  callbacks: Map<Element, VisibilityCallback>;
}

const sharedObservers = new Map<number, SharedObserver>();

function getObserver(marginPx: number): SharedObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;
  let shared = sharedObservers.get(marginPx);
  if (!shared) {
    const callbacks = new Map<Element, VisibilityCallback>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          callbacks.get(entry.target)?.(entry);
        }
      },
      { rootMargin: `${marginPx}px 0px` },
    );
    shared = { observer, callbacks };
    sharedObservers.set(marginPx, shared);
  }
  return shared;
}

function observe(el: Element, marginPx: number, cb: VisibilityCallback): () => void {
  const shared = getObserver(marginPx);
  if (!shared) return () => {};
  shared.callbacks.set(el, cb);
  shared.observer.observe(el);
  return () => {
    shared.observer.unobserve(el);
    shared.callbacks.delete(el);
  };
}

interface LazyFeedItemProps {
  children: ReactNode;
  /**
   * Mount children on first render. Pass `true` for items likely to be in the
   * initial viewport (e.g. the first ~10 of a feed) so the first paint isn't
   * a wall of placeholders; later items start as placeholders and mount when
   * scrolled near.
   */
  initialInView?: boolean;
  /** Class applied to the wrapper div (e.g. `cv-feed-item`). */
  className?: string;
  /**
   * Stable identity for this item across remounts (e.g. `feedItemKey(item)`).
   * When set, the measured height is remembered so the placeholder starts at
   * the right size the next time this item is rendered, and the wrapper is
   * tagged `data-scroll-key` so `ScrollToTop` can restore scroll position
   * relative to this item after a back navigation.
   */
  cacheKey?: string;
}

/**
 * Windowed feed item: mounts `children` once the item comes within
 * {@link MOUNT_MARGIN_PX} of the viewport, and swaps in a fixed-height
 * placeholder once it is further than {@link UNMOUNT_MARGIN_PX} away.
 *
 * Why this exists: feeds accumulate pages without bound, and every mounted
 * NoteCard costs real memory and CPU (dozens of hooks, queries, effects, and
 * IntersectionObservers each). The `content-visibility: auto` rule on
 * `cv-feed-item` skips *paint* for offscreen cards but keeps the React tree —
 * and all its subscriptions — alive. This component bounds the number of live
 * cards to roughly what fits in viewport + margin, which is what keeps long
 * scroll sessions from exhausting memory on mobile.
 *
 * The placeholder height is captured from the element's actual bounding rect
 * at the moment it leaves the mount margin, so unmounting never shifts layout
 * or the scroll position.
 */
export function LazyFeedItem({ children, initialInView = false, className, cacheKey }: LazyFeedItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(initialInView);
  const heightRef = useRef<number>((cacheKey && heightCache.get(cacheKey)) || ESTIMATED_HEIGHT_PX);

  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;

  // Only the crossing that can change this item's state is watched: the mount
  // margin while it is a placeholder, the unmount margin while it is mounted.
  // Every observed target is recomputed on every frame the page renders, and
  // a long session holds hundreds of rows.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!inView) {
      return observe(el, MOUNT_MARGIN_PX, (entry) => {
        const height = entry.boundingClientRect.height;
        if (height > 0) rememberHeight(cacheKeyRef.current, height);
        if (entry.isIntersecting) setInView(true);
      });
    }
    return observe(el, UNMOUNT_MARGIN_PX, (entry) => {
      // The height when leaving also sizes the placeholder, so unmounting
      // occupies exactly the same space.
      const height = entry.boundingClientRect.height;
      if (height > 0) {
        if (!entry.isIntersecting) heightRef.current = height;
        rememberHeight(cacheKeyRef.current, height);
      }
      if (!entry.isIntersecting) setInView(false);
    });
  }, [inView]);

  // Items on screen when the whole feed unmounts (e.g. the user tapped a
  // post) never get an observer callback, so measure them on the way out.
  // Must be a layout effect: passive cleanup runs after the node is detached
  // and would measure zero.
  useLayoutEffect(() => {
    const el = ref.current;
    return () => {
      if (el) rememberHeight(cacheKeyRef.current, el.offsetHeight);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      data-scroll-key={cacheKey}
      style={{ containIntrinsicSize: `auto ${heightRef.current}px` }}
    >
      {inView ? children : <div style={{ height: heightRef.current }} aria-hidden="true" />}
    </div>
  );
}
