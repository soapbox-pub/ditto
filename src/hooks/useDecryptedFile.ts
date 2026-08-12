import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppContext } from './useAppContext';
import { getEffectiveBlossomServers } from '@/lib/appBlossom';
import { blossomAlternatives } from '@/lib/blossomFallback';
import {
  decryptFileToObjectUrl,
  FileTooLargeError,
  isSupportedEncryption,
  type FileEncryption,
} from '@/lib/encryptedFile';

export interface DecryptedFileState {
  /**
   * What to feed `<img src>` / `<video src>`: the original URL when the file
   * isn't encrypted, an object URL once decrypted, `undefined` while decrypting
   * or after a failure.
   */
  src: string | undefined;
  /** Plaintext MIME type, once known. */
  mime: string | undefined;
  /** Whether the file is encrypted at all. */
  encrypted: boolean;
  /** Decryption is in flight. */
  loading: boolean;
  /** The file is encrypted and we couldn't produce plaintext. */
  error: boolean;
  /** The file is encrypted with an algorithm this client doesn't implement. */
  unsupported: boolean;
  /** The file exceeds the size cap and hasn't been explicitly allowed through. */
  tooLarge: boolean;
  /** Size in bytes, known only when we refused the file for being too large. */
  byteSize: number | undefined;
  /** Decrypt anyway, ignoring the size cap. Only meaningful when `tooLarge`. */
  decryptAnyway: () => void;
}

export interface UseDecryptedFileOptions {
  /**
   * Defer decryption until true. Use for off-screen grid tiles so scrolling a
   * media feed doesn't decrypt everything at once. Defaults to true.
   */
  enabled?: boolean;
}

interface InternalState {
  src?: string;
  mime?: string;
  error: boolean;
  tooLarge?: number;
}

/**
 * Resolve a media URL for display, decrypting it first when the event marks it
 * as encrypted (NIP-94 `encryption-algorithm` / `decryption-key` /
 * `decryption-nonce`).
 *
 * Unencrypted URLs pass straight through, so callers can use this
 * unconditionally. Encrypted files are fetched and decrypted into an object
 * URL, which is revoked when the URL changes or the component unmounts.
 *
 * On failure `src` stays `undefined` and `error` is set — callers must render a
 * placeholder rather than falling back to the raw URL, which would display
 * ciphertext. Files past the size cap set `tooLarge` instead, and the user can
 * wave one through with `decryptAnyway()`.
 */
export function useDecryptedFile(
  url: string,
  encryption: FileEncryption | undefined,
  opts: UseDecryptedFileOptions = {},
): DecryptedFileState {
  const { enabled = true } = opts;
  const { config } = useAppContext();
  const [state, setState] = useState<InternalState>({ error: false });
  const [allowOversize, setAllowOversize] = useState(false);

  // Depend on the tag values rather than object identity — callers often build
  // the encryption object inline during render.
  const { algorithm, key, nonce, hash, mime: declaredMime } = encryption ?? {};
  const fallbacks = encryption?.fallbacks?.join('\n');

  const servers = getEffectiveBlossomServers(
    config.blossomServerMetadata,
    config.useAppBlossomServers,
  );
  const serverKey = servers.join('\n');

  const alternatives = useMemo(
    () => blossomAlternatives(url, servers),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url, serverKey],
  );

  const unsupported = !!encryption && !isSupportedEncryption(encryption);

  // A new source is a new decision — don't carry an override across it.
  useEffect(() => setAllowOversize(false), [url]);

  useEffect(() => {
    if (!algorithm || !key || !nonce || unsupported) {
      setState({ error: unsupported });
      return;
    }
    if (!enabled) return;

    let objectUrl: string | undefined;
    let cancelled = false;
    const controller = new AbortController();

    setState({ error: false });

    decryptFileToObjectUrl(
      url,
      {
        algorithm,
        key,
        nonce,
        hash,
        mime: declaredMime,
        fallbacks: fallbacks ? fallbacks.split('\n') : undefined,
      },
      {
        signal: controller.signal,
        fallbackUrls: alternatives,
        ...(allowOversize ? { maxBytes: Number.POSITIVE_INFINITY } : {}),
      },
    )
      .then((result) => {
        if (cancelled) {
          URL.revokeObjectURL(result.objectUrl);
          return;
        }
        objectUrl = result.objectUrl;
        setState({ src: result.objectUrl, mime: result.mime, error: false });
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof FileTooLargeError) setState({ error: false, tooLarge: e.byteSize });
        else setState({ error: true });
      });

    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    url,
    algorithm,
    key,
    nonce,
    hash,
    declaredMime,
    fallbacks,
    unsupported,
    alternatives,
    enabled,
    allowOversize,
  ]);

  const decryptAnyway = useCallback(() => setAllowOversize(true), []);

  if (!encryption) {
    return {
      src: url,
      mime: undefined,
      encrypted: false,
      loading: false,
      error: false,
      unsupported: false,
      tooLarge: false,
      byteSize: undefined,
      decryptAnyway,
    };
  }

  const tooLarge = state.tooLarge !== undefined;

  return {
    src: state.src,
    mime: state.mime ?? declaredMime,
    encrypted: true,
    loading: enabled && !state.src && !state.error && !tooLarge,
    error: state.error,
    unsupported,
    tooLarge,
    byteSize: state.tooLarge,
    decryptAnyway,
  };
}
