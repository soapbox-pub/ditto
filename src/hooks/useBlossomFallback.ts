import { useCallback, useContext, useMemo, useRef, useState } from 'react';

import { AppContext } from '@/contexts/AppContext';
import { APP_BLOSSOM_SERVERS, getEffectiveBlossomServers } from '@/lib/appBlossom';
import { mediaCandidates } from '@/lib/blossomFallback';

/**
 * Cross-server media fallback, in composable pieces.
 *
 * A Blossom URL is content-addressed (`/<sha256>`), and `useUploadFile` mirrors
 * every blob across the effective server list (BUD-04), so the same bytes are
 * usually reachable on several hosts. Everything that renders such a URL
 * should try the other hosts before giving up, and should decide the ORDER in
 * exactly one place (`mediaCandidates`).
 *
 * - {@link useBlossomServers}: the viewer's effective server list, memoized.
 * - {@link useBlossomCandidates}: that list applied to one URL.
 * - {@link useSourceWalk}: an index over any candidate list, advanced by the
 *   element's error and reset by a manual retry.
 * - {@link useBlossomFallback}: the pieces composed, for an `<img>`/`<video>`.
 */

/**
 * The viewer's effective Blossom server list, stable across renders.
 *
 * Reads the context directly rather than through `useAppContext`, which throws
 * without a provider: this sits under every avatar, so it must render wherever
 * an avatar does. With no config in reach the app defaults stand in — the same
 * list a fresh install has.
 */
export function useBlossomServers(): string[] {
  const config = useContext(AppContext)?.config;
  const meta = config?.blossomServerMetadata;
  const useApp = config?.useAppBlossomServers ?? true;
  return useMemo(
    () => (meta ? getEffectiveBlossomServers(meta, useApp) : [...APP_BLOSSOM_SERVERS.servers]),
    [meta, useApp],
  );
}

/**
 * The ordered sources for one media reference: the URL, the sender's declared
 * `fallback`s (sanitized), then the same blob on the viewer's other servers.
 * Memoized on the URLs' CONTENT, since callers routinely rebuild the fallback
 * array every render. Empty when there is no URL.
 */
export function useBlossomCandidates(
  url: string | undefined,
  declaredFallbacks?: readonly string[],
): string[] {
  const servers = useBlossomServers();
  // A URL cannot contain a newline, so joining on one is a faithful identity.
  const declaredKey = declaredFallbacks?.join('\n') ?? '';
  return useMemo(
    () => (url ? mediaCandidates(url, declaredKey ? declaredKey.split('\n') : undefined, servers) : []),
    [url, declaredKey, servers],
  );
}

export interface SourceWalk {
  /** The candidate to load now; `undefined` only when there are none. */
  src: string | undefined;
  /** Wire onto the element's `onError` — moves to the next candidate. */
  advance: () => void;
  /** True once every candidate has failed. Never true for an empty list. */
  failed: boolean;
  /** Start over from the first candidate — the manual retry. */
  reset: () => void;
}

/**
 * An index over a candidate list, driven by whatever detects a failure.
 *
 * Resets to the first candidate whenever the PRIMARY changes, synchronously in
 * render, so a reused component whose URL changed never paints one frame at a
 * stale index and never inherits the previous URL's failure.
 */
export function useSourceWalk(candidates: readonly string[]): SourceWalk {
  const [index, setIndex] = useState(0);

  const primary = candidates[0];
  const prevPrimary = useRef(primary);
  if (prevPrimary.current !== primary) {
    prevPrimary.current = primary;
    if (index !== 0) setIndex(0);
  }

  const length = candidates.length;
  const advance = useCallback(() => setIndex((i) => Math.min(i + 1, length)), [length]);
  const reset = useCallback(() => setIndex(0), []);

  return {
    src: candidates[Math.min(index, length - 1)],
    advance,
    failed: length > 0 && index >= length,
    reset,
  };
}

export interface BlossomFallback<S extends string | undefined> {
  /** The source to render now. */
  src: S;
  /** Wire onto `<img>`/`<video>` `onError` — advances to the next source. */
  onError: () => void;
  /** True once every source has failed (a single non-Blossom URL fails after one error). */
  failed: boolean;
  /** Start over from the original URL. */
  reset: () => void;
}

/**
 * Given a media URL, walk the same content-addressed blob across the viewer's
 * other Blossom servers as loads fail, after any sender-declared fallbacks.
 *
 * Returns `{ src, onError, failed, reset }` — wire the first two onto the
 * element. `failed` is true once nothing is left to try, so a caller can show
 * its own placeholder instead of a broken-image icon.
 */
export function useBlossomFallback(originalUrl: string, declaredFallbacks?: readonly string[]): BlossomFallback<string>;
export function useBlossomFallback(
  originalUrl: string | undefined,
  declaredFallbacks?: readonly string[],
): BlossomFallback<string | undefined>;
export function useBlossomFallback(
  originalUrl: string | undefined,
  declaredFallbacks?: readonly string[],
): BlossomFallback<string | undefined> {
  const candidates = useBlossomCandidates(originalUrl, declaredFallbacks);
  const { src, advance, failed, reset } = useSourceWalk(candidates);
  return { src: src ?? originalUrl, onError: advance, failed, reset };
}
