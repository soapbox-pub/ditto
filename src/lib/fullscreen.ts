/** WebKit's prefixed fullscreen surface (Safari before 16.4, iPhone's video-only mode). */
type WebkitDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => void };
type WebkitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void; webkitDisplayingFullscreen?: boolean };

export function fullscreenElement(): Element | null {
  return document.fullscreenElement ?? (document as WebkitDocument).webkitFullscreenElement ?? null;
}

/** The bare `<video>` is fullscreen (native controls; their taps arrive as element clicks). */
export function videoIsNativeFullscreen(video: HTMLVideoElement): boolean {
  return fullscreenElement() === video || !!(video as WebkitVideo).webkitDisplayingFullscreen;
}

export function exitFullscreen(): void {
  // Older engines return nothing rather than a promise, hence the `?.`.
  if (document.exitFullscreen) void (document.exitFullscreen() as Promise<void> | undefined)?.catch(() => {});
  else (document as WebkitDocument).webkitExitFullscreen?.();
}

/**
 * Fullscreens a player's container so its custom controls come along. Where
 * only a video can go fullscreen (iPhone), or the request is refused, falls
 * back to the video's native player, which brings its own controls and Done
 * button. `onFallback` runs when that happens.
 */
export function requestPlayerFullscreen(
  container: HTMLElement,
  video: HTMLVideoElement | null,
  onFallback?: () => void,
): void {
  holdPageScroll();
  const el = container as WebkitElement;
  const nativeFallback = () => {
    onFallback?.();
    const v = video as WebkitVideo | null;
    if (v?.webkitEnterFullscreen) v.webkitEnterFullscreen();
    else void (v?.requestFullscreen?.() as Promise<void> | undefined)?.catch(() => {});
  };
  if (el.requestFullscreen) {
    void (el.requestFullscreen({ navigationUI: 'hide' }) as Promise<void> | undefined)?.catch(nativeFallback);
  } else if (el.webkitRequestFullscreen) {
    el.webkitRequestFullscreen();
  } else {
    nativeFallback();
  }
}

/** How long after leaving fullscreen the page's scroll is still held. */
const HOLD_AFTER_EXIT_MS = 600;
/** Gives up if fullscreen never arrives (the request was refused). */
const HOLD_ENTER_TIMEOUT_MS = 1500;

let releaseHold: (() => void) | undefined;

/**
 * Keeps the page where it is while a player goes fullscreen and comes back.
 * Android's WebView can drop the page to the top as it enters fullscreen,
 * and doesn't put it back on the way out; any jump while this holds is
 * undone in the scroll event, before it's drawn.
 */
function holdPageScroll(): void {
  releaseHold?.();
  const y = window.scrollY;
  let entered = false;
  let timer = setTimeout(() => { if (!entered) release(); }, HOLD_ENTER_TIMEOUT_MS);

  const onScroll = () => {
    if (Math.abs(window.scrollY - y) > 1) window.scrollTo({ top: y, behavior: 'instant' });
  };
  const onChange = () => {
    if (fullscreenElement()) {
      entered = true;
      clearTimeout(timer);
      return;
    }
    // Out again: one more correction once layout settles, then let go.
    onScroll();
    clearTimeout(timer);
    timer = setTimeout(() => { onScroll(); release(); }, HOLD_AFTER_EXIT_MS);
  };
  // The user scrolling for real ends the hold.
  const onUserScroll = () => { if (!fullscreenElement()) release(); };

  function release() {
    clearTimeout(timer);
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('fullscreenchange', onChange);
    document.removeEventListener('webkitfullscreenchange', onChange);
    window.removeEventListener('wheel', onUserScroll);
    window.removeEventListener('touchstart', onUserScroll);
    if (releaseHold === release) releaseHold = undefined;
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('fullscreenchange', onChange);
  document.addEventListener('webkitfullscreenchange', onChange);
  window.addEventListener('wheel', onUserScroll, { passive: true });
  window.addEventListener('touchstart', onUserScroll, { passive: true });
  releaseHold = release;
}
