import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * How far beyond the viewport (px, each direction) items stay mounted.
 * Generous enough that normal scrolling never shows an unmounted card,
 * small enough that a long session doesn't keep hundreds of cards live.
 */
const MOUNT_MARGIN_PX = 2000;

/**
 * Fallback placeholder height before an item has ever been measured.
 * Matches the `contain-intrinsic-size: auto 300px` estimate used by the
 * `cv-feed-item` content-visibility rule in index.css.
 */
const ESTIMATED_HEIGHT_PX = 300;

type VisibilityCallback = (entry: IntersectionObserverEntry) => void;

/**
 * One shared IntersectionObserver for every feed item, instead of one
 * observer per item. Callbacks are looked up per element.
 */
const callbacks = new Map<Element, VisibilityCallback>();
let sharedObserver: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;
  sharedObserver ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        callbacks.get(entry.target)?.(entry);
      }
    },
    { rootMargin: `${MOUNT_MARGIN_PX}px 0px` },
  );
  return sharedObserver;
}

function observe(el: Element, cb: VisibilityCallback): () => void {
  const observer = getObserver();
  if (!observer) return () => {};
  callbacks.set(el, cb);
  observer.observe(el);
  return () => {
    observer.unobserve(el);
    callbacks.delete(el);
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
}

/**
 * Windowed feed item: renders `children` only while the item is within
 * {@link MOUNT_MARGIN_PX} of the viewport, and swaps in a fixed-height
 * placeholder when it scrolls far away.
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
export function LazyFeedItem({ children, initialInView = false, className }: LazyFeedItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(initialInView);
  const heightRef = useRef<number>(ESTIMATED_HEIGHT_PX);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    return observe(el, (entry) => {
      if (!entry.isIntersecting) {
        // Capture the real rendered height before unmounting so the
        // placeholder occupies exactly the same space.
        const height = entry.boundingClientRect.height;
        if (height > 0) heightRef.current = height;
      }
      setInView(entry.isIntersecting);
    });
  }, []);

  return (
    <div ref={ref} className={className}>
      {inView ? children : <div style={{ height: heightRef.current }} aria-hidden="true" />}
    </div>
  );
}
