import { holdChromeUntilUserScroll } from '@/hooks/useScrollDirection';
import { saveScrollAnchor, type SavedScroll } from '@/lib/scrollPositions';

/**
 * How long (ms) a restore keeps correcting by default its target while the page is
 * still laying out. The feed re-renders from the query cache synchronously,
 * but content-visibility unlocks, placeholder swaps and media settle over
 * the next few frames.
 */
const RESTORE_WINDOW_MS = 1000;

/** Events that mean the user has taken over scrolling; the restore stops. */
const USER_INPUT_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

/** Scroll offsets are doubles on zoomed pages; treat sub-pixel gaps as equal. */
function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 1;
}

export function findScrollAnchor(key: string): Element | null {
  const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(key)
    : key.replace(/["\\]/g, '\\$&');
  // In the page on screen, not the copy of the previous page under it (BackSwipe).
  return document.querySelector(`[data-push-source] [data-scroll-key="${escaped}"]`);
}

/**
 * Bring the page back to `saved`, then keep correcting on subsequent frames
 * while layout is still settling. Gives up after `windowMs`, or as soon as
 * the user scrolls on their own. With `hold`, it keeps the target in place
 * for the whole window instead of stopping once it first lands. Returns a
 * function that stops the restore early.
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

  const stop = () => {
    done = true;
    cancelAnimationFrame(raf);
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

  const tick = () => {
    if (done) return;
    if (performance.now() > deadline || (step() && !hold)) {
      stop();
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  // Always re-check on the next frame even if the first step already landed:
  // the first step runs before paint, and content-visibility unlocks and
  // image loads in the following frame can still move the target.
  step();
  raf = requestAnimationFrame(tick);

  return stop;
}
