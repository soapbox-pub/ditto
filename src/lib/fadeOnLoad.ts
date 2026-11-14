/**
 * Images with the `fade-on-load` class (index.css) start transparent and fade
 * in once `data-loaded` is set. Set straight on the element, so a feed of
 * avatars fades in without re-rendering any of them.
 */

/** For `onLoad` (and `onError`, so a failed image never stays hidden). */
export function markImageLoaded(img: HTMLImageElement): void {
  img.dataset.loaded = '';
}

/** For a ref: an image already decoded (cached) shows without fading. */
export function markIfAlreadyLoaded(img: HTMLImageElement | null): void {
  if (img?.complete && img.naturalWidth > 0) markImageLoaded(img);
}
