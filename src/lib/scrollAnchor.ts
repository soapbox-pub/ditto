/** How long after a cache write to keep correcting for the renders it causes. */
const ANCHOR_WINDOW_MS = 1000;

/**
 * Keep the feed card at the top of the viewport in place while the next
 * renders insert or resize content above it, so a card inserted above the
 * viewport doesn't shift the whole feed under the user.
 *
 * Native CSS scroll anchoring isn't enough: older iOS WebKit has none, and
 * the WebKit that does (it reports `overflow-anchor` support) still lets the
 * feed jump here. So native anchoring is switched off for the window and the
 * card is held by hand; both at once would double-correct.
 *
 * Call right before writing to the query cache.
 */
export function holdScrollAnchor(): void {
  // At the top, the user should see what's inserted there.
  if (window.scrollY <= 0) return;

  const anchor = Array.from(document.querySelectorAll<HTMLElement>('.cv-feed-item'))
    .find((el) => el.getBoundingClientRect().bottom > 0);
  if (!anchor) return;

  const root = document.documentElement;
  const prevOverflowAnchor = root.style.overflowAnchor;
  root.style.overflowAnchor = 'none';

  // Offset in the document, so the user's own scrolling doesn't count as a shift.
  const offset = () => anchor.getBoundingClientRect().top + window.scrollY;
  let top = offset();

  const release = () => {
    mutations.disconnect();
    resizes.disconnect();
    clearTimeout(timer);
    root.style.overflowAnchor = prevOverflowAnchor;
  };

  // Both callbacks run before paint, so the correction lands in the same frame.
  // Mutations catch the inserted card; resizes catch layout that changes
  // without a mutation, like an off-screen card settling to its
  // `content-visibility` placeholder size or an image loading.
  const correct = () => {
    if (!anchor.isConnected) return release();
    const next = offset();
    if (next !== top) {
      window.scrollTo(0, window.scrollY + next - top);
      top = next;
    }
  };
  const mutations = new MutationObserver(correct);
  mutations.observe(document.body, { childList: true, subtree: true, characterData: true });
  const resizes = new ResizeObserver(correct);
  resizes.observe(document.body);
  const timer = setTimeout(release, ANCHOR_WINDOW_MS);
}
