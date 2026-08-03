/**
 * A 1x1 fully transparent GIF used as a `poster` for custom video players.
 *
 * Android WebView (Chromium) and iOS WKWebView render a large, stretched gray
 * play-circle over any poster-less `<video>` element while the media loads —
 * drawn by the browser's media-controls shadow DOM. Giving the element a
 * transparent poster makes the engine paint that (i.e. nothing) instead of the
 * built-in placeholder, while our own thumbnail/play-button overlays sit on top.
 */
export const BLANK_POSTER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
