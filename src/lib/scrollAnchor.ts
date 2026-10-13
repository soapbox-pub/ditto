/** How long after a cache write to keep correcting for the renders it causes. */
const ANCHOR_WINDOW_MS = 1000;

/**
 * Keep the feed card at the top of the viewport in place while the next
 * renders insert or resize content above it. Browsers with CSS scroll
 * anchoring do this themselves; iOS WebKit doesn't, so a card inserted above
 * the viewport shifts the whole feed under the user.
 *
 * Call right before writing to the query cache.
 */
export function holdScrollAnchor(): void {
  if (typeof CSS !== 'undefined' && CSS.supports('overflow-anchor', 'auto')) return;
  // At the top, the user should see what's inserted there.
  if (window.scrollY <= 0) return;

  const anchor = Array.from(document.querySelectorAll<HTMLElement>('.cv-feed-item'))
    .find((el) => el.getBoundingClientRect().bottom > 0);
  if (!anchor) return;

  // Offset in the document, so the user's own scrolling doesn't count as a shift.
  const offset = () => anchor.getBoundingClientRect().top + window.scrollY;
  let top = offset();

  // Mutation callbacks run before paint, so the correction lands in the same frame.
  const observer = new MutationObserver(() => {
    if (!anchor.isConnected) {
      observer.disconnect();
      clearTimeout(timer);
      return;
    }
    const next = offset();
    if (next !== top) {
      window.scrollTo(0, window.scrollY + next - top);
      top = next;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  const timer = setTimeout(() => observer.disconnect(), ANCHOR_WINDOW_MS);
}
