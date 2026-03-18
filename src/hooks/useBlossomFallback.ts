import { useCallback, useMemo, useRef, useState } from 'react';

import { useAppContext } from './useAppContext';
import { getEffectiveBlossomServers } from '@/lib/appBlossom';

/** SHA-256 hash pattern (64 hex characters) used in Blossom content-addressed URLs. */
const BLOSSOM_PATH_REGEX = /^\/([a-f0-9]{64})\b/;

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
  const alternatives = useMemo(() => {
    try {
      const parsed = new URL(originalUrl);
      if (!BLOSSOM_PATH_REGEX.test(parsed.pathname)) return [];

      const origin = parsed.origin;
      return servers
        .filter((server) => {
          try {
            return new URL(server).origin !== origin;
          } catch {
            return false;
          }
        })
        .map((server) => {
          const base = new URL(server);
          return `${base.origin}${parsed.pathname}${parsed.search}`;
        });
    } catch {
      return [];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalUrl, config.blossomServerMetadata, config.useAppBlossomServers]);

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
