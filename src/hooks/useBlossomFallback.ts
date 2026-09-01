import { useCallback, useMemo, useRef, useState } from 'react';

import { useAppContext } from './useAppContext';
import { getEffectiveBlossomServers } from '@/lib/appBlossom';
import { blossomAlternatives } from '@/lib/blossomFallback';

/**
 * Given a media URL, provides fallback URLs from other configured Blossom servers.
 *
 * If the URL points to a Blossom server (path matches `/<sha256>...`), and the
 * primary URL fails to load, calling `onError()` swaps to the next configured
 * Blossom server that serves the same content-addressed blob.
 *
 * Returns `{ src, onError }` — wire these onto `<img>` or `<video>` elements.
 */
export function useBlossomFallback(originalUrl: string) {
  const { config } = useAppContext();
  const [fallbackIndex, setFallbackIndex] = useState(-1);
  const failedRef = useRef(false);

  const servers = getEffectiveBlossomServers(
    config.blossomServerMetadata,
    config.useAppBlossomServers,
  );

  // Build the list of alternative URLs from configured Blossom servers.
  // Only applies if the URL path looks like a content-addressed blob (/<sha256>...).
  const alternatives = useMemo(
    () => blossomAlternatives(originalUrl, servers),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [originalUrl, config.blossomServerMetadata, config.useAppBlossomServers],
  );

  const src = fallbackIndex < 0 ? originalUrl : (alternatives[fallbackIndex] ?? originalUrl);

  const onError = useCallback(() => {
    if (alternatives.length === 0) return;

    setFallbackIndex((prev) => {
      const next = prev + 1;
      if (next < alternatives.length) {
        return next;
      }
      if (!failedRef.current) {
        failedRef.current = true;
      }
      return prev;
    });
  }, [alternatives]);

  return { src, onError, failed: failedRef.current && fallbackIndex >= alternatives.length - 1 };
}
