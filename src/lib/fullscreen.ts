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
