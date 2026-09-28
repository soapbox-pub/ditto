/**
 * While the app is in the background, the WebView goes QUIET.
 *
 * Android: with persistent notifications on, the native notification service
 * is a foreground service, so Android never freezes the app's process and the
 * WebView kept running as if it were on screen: its own live REQ for
 * notifications (the same one the service holds), the home feed's new-post
 * stream, and a search page's firehose, all night. None of that shows the
 * user anything from the background — the service (or remote push) is what
 * notifies — so it was battery spent downloading the same relays twice.
 *
 * Web and iOS: a hidden browser tab (or an iOS app the OS hasn't suspended
 * yet) kept the same streams open too. Push, handled by the service worker or
 * the OS, is what notifies there as well.
 *
 * Going quiet loses nothing: each live stream resumes from where it paused
 * (see {@link createLiveCursor}) and the notification caches refetch on
 * resume. Not while audio or video is playing, which keeps the page awake.
 *
 * Ported from Armada's backgroundQuiet.
 */
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/** Grace before going quiet, so a quick app switch doesn't tear streams down. */
const QUIET_AFTER_MS = 15_000;
/** Longer on the web, where flipping between tabs is routine. */
const WEB_QUIET_AFTER_MS = 60_000;

let quiet = false;
/** The app is in the background (whether or not it has gone quiet yet). */
let backgrounded = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let installed = false;
const listeners = new Set<() => void>();

function set(next: boolean): void {
  if (quiet === next) return;
  quiet = next;
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A listener must never break the others.
    }
  }
}

/** Whether audio or video is playing, which must keep running in the background. */
function mediaPlaying(): boolean {
  for (const media of document.querySelectorAll<HTMLMediaElement>('audio, video')) {
    if (!media.paused && !media.ended) return true;
  }
  return false;
}

/** Go quiet after the grace period, unless the app comes back or media is playing then. */
function scheduleQuiet(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    if (backgrounded && !mediaPlaying()) set(true);
  }, Capacitor.isNativePlatform() ? QUIET_AFTER_MS : WEB_QUIET_AFTER_MS);
}

function setBackgrounded(next: boolean): void {
  backgrounded = next;
  if (!next) {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    set(false);
    return;
  }
  scheduleQuiet();
}

function install(): void {
  if (installed) return;
  installed = true;
  if (Capacitor.isNativePlatform()) {
    // Capacitor's appStateChange comes from the activity lifecycle; the
    // WebView's own visibilitychange isn't delivered reliably on Android.
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => setBackgrounded(!isActive));
  } else {
    document.addEventListener('visibilitychange', () => setBackgrounded(document.hidden));
    if (document.hidden) setBackgrounded(true);
  }
  // Playback can also START while quiet (lock-screen media controls).
  // Media events don't bubble, hence the capture.
  document.addEventListener('play', () => set(false), true);
  // And stop while backgrounded, playing or not when the app went away: go
  // quiet once nothing is playing any more, rather than stay awake all night.
  const onStop = () => {
    if (backgrounded && !quiet) scheduleQuiet();
  };
  document.addEventListener('pause', onStop, true);
  document.addEventListener('ended', onStop, true);
}

/** Whether the WebView is quiet right now (see the module comment). */
export function isBackgroundQuiet(): boolean {
  return quiet;
}

/** Subscribe to quiet flips. Installs the app-state listener on first use. */
export function onBackgroundQuiet(listener: () => void): () => void {
  install();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Where a live stream should (re)start, from {@link LiveCursor.next}. */
export interface LiveStart {
  /** Unix seconds to subscribe from. */
  since: number;
  /** True when this resumes a stream that went quiet, rather than a new one. */
  resumed: boolean;
}

export interface LiveCursor {
  /**
   * Call at the top of a streaming effect. Returns null while quiet (open
   * nothing), otherwise where to subscribe from: `now` for a new stream, or
   * the moment it went quiet when `key` names the same stream resuming.
   */
  next(key: string, quiet: boolean): LiveStart | null;
}

/** Per-stream memory of when it went quiet. Hold one in a ref. */
export function createLiveCursor(): LiveCursor {
  let state: { key: string; pausedAt?: number } | undefined;
  return {
    next(key, isQuiet) {
      const now = Math.floor(Date.now() / 1000);
      const pausedAt = state?.key === key ? state.pausedAt : undefined;
      if (isQuiet) {
        state = { key, pausedAt: pausedAt ?? now };
        return null;
      }
      state = { key };
      return pausedAt !== undefined ? { since: pausedAt, resumed: true } : { since: now, resumed: false };
    },
  };
}
