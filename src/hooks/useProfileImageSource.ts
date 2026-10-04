import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { useBlossomFallback, useBlossomServers } from '@/hooks/useBlossomFallback';
import { blossomAlternatives } from '@/lib/blossomFallback';
import type { FileEncryption } from '@/lib/encryptedFile';
import type { ImetaEntry } from '@/lib/imeta';
import { imetaFor } from '@/lib/profileImeta';
import {
  getSharedDecryption,
  sharedDecryptionKey,
  subscribeSharedDecryption,
  type SharedDecryption,
} from '@/lib/sharedDecryptedMedia';

export interface ProfileImageSource {
  /** What to put in `src`. Undefined while an encrypted image decrypts. */
  src: string | undefined;
  /** Wire onto the element's `onError`. */
  onError: () => void;
  /** Nothing left to try — render the placeholder instead. */
  failed: boolean;
  /** An encrypted image is still being fetched and decrypted. */
  pending: boolean;
  /** The imeta entry that applies to this image, if any — for `blurhash`, `dim`, `alt`. */
  imeta: ImetaEntry | undefined;
}

const IDLE: SharedDecryption = { status: 'ready' };
const noop = () => () => {};

/** A shared decryption of `url` (see `sharedDecryptedMedia`), or idle when there's nothing to decrypt. */
function useSharedDecryption(url: string | undefined, encryption: FileEncryption | undefined): SharedDecryption {
  const servers = useBlossomServers();
  const key = url && encryption ? sharedDecryptionKey(url, encryption) : undefined;

  // The key captures everything that decides the result; keep the latest
  // objects in a ref so callers rebuilding them each render don't resubscribe.
  const latest = useRef({ url, encryption, servers });
  latest.current = { url, encryption, servers };

  const subscribe = useMemo(() => {
    if (!key) return noop;
    return (listener: () => void) => {
      const { url, encryption, servers } = latest.current;
      if (!url || !encryption) return () => {};
      return subscribeSharedDecryption(url, encryption, blossomAlternatives(url, servers), listener);
    };
  }, [key]);

  const getSnapshot = useCallback(() => (key ? getSharedDecryption(key) : IDLE), [key]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Resolve a profile `picture` or `banner` for display, honouring the kind 0's
 * imeta for it (see `parseProfileImeta`).
 *
 * Unencrypted images walk the declared `fallback`s and then the viewer's other
 * Blossom servers, exactly as `useBlossomFallback` does. Encrypted ones are
 * decrypted once per file and shared across every element showing them, and
 * never fall back to the raw URL — that would only paint ciphertext.
 *
 * `imeta` that doesn't describe `rawSrc` is ignored, so it is always safe to
 * pass the author's entry even where the URL may have been edited.
 */
export function useProfileImageSource(rawSrc: string | undefined, imeta: ImetaEntry | undefined): ProfileImageSource {
  const entry = imetaFor(rawSrc, imeta);
  const encryption = entry?.encryption;

  const walk = useBlossomFallback(encryption ? undefined : rawSrc, entry?.fallbacks);
  const decryption = useSharedDecryption(encryption ? rawSrc : undefined, encryption);

  // A decrypted blob the browser can't decode is as dead as a failed fetch.
  const [broken, setBroken] = useState<string>();
  const decryptedSrc = decryption.src;
  const markBroken = useCallback(() => setBroken(decryptedSrc), [decryptedSrc]);

  if (encryption) {
    return {
      src: decryptedSrc,
      onError: markBroken,
      failed: decryption.status === 'error' || (!!decryptedSrc && broken === decryptedSrc),
      pending: decryption.status === 'loading',
      imeta: entry,
    };
  }

  return { src: walk.src, onError: walk.onError, failed: walk.failed, pending: false, imeta: entry };
}
