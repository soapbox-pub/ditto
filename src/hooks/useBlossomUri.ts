import { useCallback, useMemo, useRef, useState } from 'react';

import { useAppContext } from './useAppContext';
import { getEffectiveBlossomServers } from '@/lib/appBlossom';
import { resolveBlossomUri, type BlossomUri } from '@/lib/blossomUri';

/**
 * Resolves a parsed BUD-10 `blossom:` URI to a concrete media URL, with
 * automatic fallback across candidate servers.
 *
 * Candidate URLs are built from the URI's `xs` server hints followed by the
 * user's effective Blossom servers (see {@link resolveBlossomUri}). If the
 * current candidate fails to load, calling `onError()` advances to the next.
 *
 * Returns `{ src, onError, failed }`:
 * - `src` — the current candidate URL, or `undefined` when none could be built.
 * - `onError` — wire onto `<img>`/`<video>` `onError` to try the next server.
 * - `failed` — `true` once every candidate has been exhausted.
 */
export function useBlossomUri(uri: BlossomUri) {
  const { config } = useAppContext();
  const [index, setIndex] = useState(0);
  const failedRef = useRef(false);

  const candidates = useMemo(() => {
    const servers = getEffectiveBlossomServers(
      config.blossomServerMetadata,
      config.useAppBlossomServers,
    );
    return resolveBlossomUri(uri, servers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri.path, uri.servers, config.blossomServerMetadata, config.useAppBlossomServers]);

  const src = candidates[index];

  const onError = useCallback(() => {
    setIndex((prev) => {
      const next = prev + 1;
      if (next < candidates.length) return next;
      failedRef.current = true;
      return prev;
    });
  }, [candidates.length]);

  return {
    src,
    onError,
    failed: failedRef.current || candidates.length === 0,
  };
}
