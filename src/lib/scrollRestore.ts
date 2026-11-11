import { holdChromeUntilUserScroll } from '@/hooks/useScrollDirection';
import { saveScrollAnchor, type SavedScroll } from '@/lib/scrollPositions';

/**
 * How long (ms) a restore keeps correcting by default its target while the page is
 * still laying out. The feed re-renders from the query cache synchronously,
 * but content-visibility unlocks, placeholder swaps and media settle over
 * the next few frames.
 */
const RESTORE_WINDOW_MS = 1000;

/**
 * How long (ms) the page has to have sat on its target before a restore lets
 * go of it. Landing once isn't settling: the rows around the target mount a
 * frame or two later and resize, and letting go at the first landing left the
 * page to jump under the reader.
 */
const SETTLE_MS = 300;

/** Events that mean the user has taken over scrolling; the restore stops. */
const USER_INPUT_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

/** Scroll offsets are doubles on zoomed pages; treat sub-pixel gaps as equal. */
function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 1;
}

let correctedAt = -Infinity;

/**
 * When (`performance.now()`) a restore last had to move the page towards its
 * target. `BackSwipe` keeps its copy of the page over the real one until the
 * page has stopped being moved.
 */
export function getScrollRestoreCorrectedAt(): number {
  return correctedAt;
}

export function findScrollAnchor(key: string): Element | null {
  const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(key)
    : key.replace(/["\\]/g, '\\$&');
  // In the page on screen, not the copy of the previous page under it (BackSwipe).
  return document.querySelector(`[data-push-source] [data-scroll-key="${escaped}"]`);
}

/**
 * Bring the page back to `saved`, then keep correcting while layout is still
 * settling: on every frame, and whenever the page changes height, before that
 * change is painted. Lets go once the target has held for `SETTLE_MS`, after
 * `windowMs`, or as soon as the user scrolls on their own. With `hold`, it
 * keeps the target in place for the whole window. Returns a function that
 * stops the restore early.
 *
 * With a valid anchor, the target is "anchor element's top edge at the same
 * viewport offset as before". Without one (or while the element hasn't been
 * rendered yet) it falls back to the raw offset.
 */
export function restoreScroll(
  historyKey: string,
  saved: SavedScroll,
  { windowMs = RESTORE_WINDOW_MS, hold = false }: { windowMs?: number; hold?: boolean } = {},
): () => void {
  const deadline = performance.now() + windowMs;
  // Put the user back with the bars showing, as a native back navigation does.
  holdChromeUntilUserScroll();
  // A stale anchor (user scrolled after the click that captured it) is ignored.
  const anchor = saved.anchor && near(saved.anchor.y, saved.y) ? saved.anchor : undefined;
  let raf = 0;
  let done = false;
  let observer: ResizeObserver | undefined;

  const stop = () => {
    done = true;
    cancelAnimationFrame(raf);
    observer?.disconnect();
    for (const type of USER_INPUT_EVENTS) window.removeEventListener(type, stop, true);
  };
  for (const type of USER_INPUT_EVENTS) {
    window.addEventListener(type, stop, { capture: true, passive: true });
  }

  /** One correction step. Returns true when the target has been reached. */
  const step = (): boolean => {
    if (anchor) {
      const el = findScrollAnchor(anchor.key);
      if (el) {
        const top = el.getBoundingClientRect().top;
        if (near(top, anchor.top)) {
          // Settled. Re-save so a second return to this entry has a valid
          // anchor: the scroll listener overwrote `y` while we were moving.
          saveScrollAnchor(historyKey, { key: anchor.key, top, y: window.scrollY });
          return true;
        }
        window.scrollTo(0, window.scrollY + (top - anchor.top));
        return false;
      }
      // Element not rendered (yet): hold the raw offset while we wait for it.
    }
    if (near(window.scrollY, saved.y)) return !anchor;
    window.scrollTo(0, saved.y);
    return false;
  };

  /** Since when the target has held; undefined while the page is off it. */
  let landedAt: number | undefined;
  const correct = () => {
    if (step()) {
      landedAt ??= performance.now();
    } else {
      landedAt = undefined;
      correctedAt = performance.now();
    }
  };

  const tick = () => {
    if (done) return;
    correct();
    const now = performance.now();
    if (now > deadline || (!hold && landedAt !== undefined && now - landedAt >= SETTLE_MS)) {
      stop();
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  // The first step runs before the page's first paint. Resize callbacks run
  // after layout and before paint, so a row that mounts or resizes above the
  // target is corrected in the frame it happens rather than the one after.
  correct();
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      if (!done) correct();
    });
    observer.observe(document.body);
  }
  raf = requestAnimationFrame(tick);

  return stop;
}
