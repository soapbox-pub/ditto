import type { ImageThumbnailRequest, ImageThumbnailResponse } from './imageThumbnail.worker';

/**
 * Downscaled copies of images that are drawn small, shared between every
 * element showing the same URL.
 *
 * People upload phone photos as avatars, so a feed routinely decodes 4032×3024
 * images to paint them at 40px — and decodes them again whenever the browser's
 * decode cache evicts them while scrolling. Here each picture is fetched and
 * decoded once, in a worker, and shrunk to a small WebP that every element
 * showing it reuses. No server is involved: when a host refuses cross-origin
 * reads, or the image is animated, small, or undecodable, the original is
 * shown as before.
 *
 * Entries are reference-counted like `sharedDecryptedMedia`, and revoked a
 * while after the last element using them unmounts.
 */

export interface ImageThumbnail {
  status: 'loading' | 'ready';
  /** The downscaled object URL, or undefined to show the original. */
  src?: string;
}

/** Short side of a thumbnail, in device pixels: a 128px profile avatar on a 3x screen. */
const THUMBNAIL_SIZE = 384;
/** Decodes in flight at once. Each one briefly holds a full-size bitmap. */
const MAX_IN_FLIGHT = 3;
/** How long an unused thumbnail is kept before its object URL is revoked. */
const RELEASE_DELAY_MS = 60_000;
/**
 * How long an image waits for its thumbnail before showing the original
 * instead. A slow host or a long queue must not leave images blank; a
 * thumbnail that lands later still replaces the original.
 */
const SHOW_ORIGINAL_AFTER_MS = 3_000;
/** Free a decode slot if the worker never answers (it times its fetches out sooner). */
const SLOT_TIMEOUT_MS = 30_000;

const LOADING: ImageThumbnail = { status: 'loading' };
const ORIGINAL: ImageThumbnail = { status: 'ready' };

interface Entry {
  snapshot: ImageThumbnail;
  refs: number;
  listeners: Set<() => void>;
  releaseTimer?: ReturnType<typeof setTimeout>;
  originalTimer?: ReturnType<typeof setTimeout>;
}

const entries = new Map<string, Entry>();

let supported =
  typeof Worker !== 'undefined' &&
  typeof OffscreenCanvas !== 'undefined' &&
  typeof createImageBitmap !== 'undefined';

let worker: Worker | undefined;
let nextId = 0;
const inFlight = new Map<number, string>();
const queue: string[] = [];

/** Whether `url` could get a thumbnail. Anything else is shown as is. */
export function canThumbnail(url: string | undefined): url is string {
  return supported && !!url && url.startsWith('https://');
}

/** Current state for `url`. Stable between changes, as `useSyncExternalStore` requires. */
export function getImageThumbnail(url: string): ImageThumbnail {
  return entries.get(url)?.snapshot ?? LOADING;
}

/** Whether some element already holds a thumbnail (or attempt) for `url`. */
export function hasImageThumbnail(url: string): boolean {
  return entries.has(url);
}

function settle(url: string, snapshot: ImageThumbnail): void {
  const entry = entries.get(url);
  if (!entry) {
    if (snapshot.src) URL.revokeObjectURL(snapshot.src);
    return;
  }
  clearTimeout(entry.originalTimer);
  // Already showing the original after the wait; nothing better arrived.
  if (!snapshot.src && entry.snapshot === ORIGINAL) return;
  entry.snapshot = snapshot;
  for (const listener of entry.listeners) listener();
}

/** Give up on thumbnails entirely: everything pending shows its original. */
function disable(): void {
  supported = false;
  worker?.terminate();
  worker = undefined;
  const pending = [...inFlight.values(), ...queue];
  inFlight.clear();
  queue.length = 0;
  for (const url of pending) settle(url, ORIGINAL);
}

function getWorker(): Worker | undefined {
  if (worker || !supported) return worker;
  try {
    worker = new Worker(new URL('./imageThumbnail.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    disable();
    return undefined;
  }
  worker.onmessage = (event: MessageEvent<ImageThumbnailResponse>) => {
    const { id, blob } = event.data;
    const url = inFlight.get(id);
    inFlight.delete(id);
    if (url !== undefined) settle(url, blob ? { status: 'ready', src: URL.createObjectURL(blob) } : ORIGINAL);
    pump();
  };
  worker.onerror = disable;
  return worker;
}

function pump(): void {
  while (inFlight.size < MAX_IN_FLIGHT && queue.length > 0) {
    const url = queue.shift()!;
    // Everything showing it unmounted while it waited.
    if (!entries.has(url)) continue;
    const w = getWorker();
    if (!w) return;
    const id = nextId++;
    inFlight.set(id, url);
    w.postMessage({ id, url, size: THUMBNAIL_SIZE } satisfies ImageThumbnailRequest);
    setTimeout(() => {
      if (inFlight.get(id) !== url) return;
      inFlight.delete(id);
      if (getImageThumbnail(url) === LOADING) settle(url, ORIGINAL);
      pump();
    }, SLOT_TIMEOUT_MS);
  }
}

/**
 * Hold a reference to the thumbnail of `url`, starting it if nobody else has.
 * `listener` fires whenever its state changes. Returns the release function.
 */
export function subscribeImageThumbnail(url: string, listener: () => void): () => void {
  let entry = entries.get(url);
  if (!entry) {
    const created: Entry = { snapshot: LOADING, refs: 0, listeners: new Set() };
    entry = created;
    entries.set(url, created);
    created.originalTimer = setTimeout(() => {
      if (entries.get(url) === created && created.snapshot === LOADING) settle(url, ORIGINAL);
    }, SHOW_ORIGINAL_AFTER_MS);
    queue.push(url);
    pump();
  }

  const held = entry;
  clearTimeout(held.releaseTimer);
  held.refs++;
  held.listeners.add(listener);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    held.listeners.delete(listener);
    held.refs--;
    if (held.refs > 0) return;

    held.releaseTimer = setTimeout(() => {
      if (held.refs > 0 || entries.get(url) !== held) return;
      entries.delete(url);
      if (held.snapshot.src) URL.revokeObjectURL(held.snapshot.src);
    }, RELEASE_DELAY_MS);
  };
}

// ── Viewport proximity ────────────────────────────────────────────────────────
// One observer for every thumbnailed image on the page, so thumbnails (like the lazy
// <img> they replace) are only fetched for images about to scroll into view.

const nearCallbacks = new Map<Element, () => void>();
let nearObserver: IntersectionObserver | undefined;

/** Call `callback` once `element` comes within reach of the viewport. Returns a cancel function. */
export function whenNearViewport(element: Element, callback: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    callback();
    return () => {};
  }
  nearObserver ??= new IntersectionObserver((observed) => {
    for (const { target, isIntersecting } of observed) {
      if (!isIntersecting) continue;
      const cb = nearCallbacks.get(target);
      nearCallbacks.delete(target);
      nearObserver?.unobserve(target);
      cb?.();
    }
  }, { rootMargin: '400px' });

  nearCallbacks.set(element, callback);
  nearObserver.observe(element);
  return () => {
    if (nearCallbacks.delete(element)) nearObserver?.unobserve(element);
  };
}
