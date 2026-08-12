import { useEffect, useMemo, useState } from 'react';

import { useAppContext } from './useAppContext';
import { getEffectiveBlossomServers } from '@/lib/appBlossom';
import { blossomAlternatives } from '@/lib/blossomFallback';
import { decryptFileToObjectUrl, isSupportedEncryption, type FileEncryption } from '@/lib/encryptedFile';

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
 * ciphertext.
 */
export function useDecryptedFile(
  url: string,
  encryption: FileEncryption | undefined,
): DecryptedFileState {
  const { config } = useAppContext();
  const [state, setState] = useState<{ src?: string; mime?: string; error: boolean }>({ error: false });

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

  useEffect(() => {
    if (!algorithm || !key || !nonce || unsupported) {
      setState({ error: unsupported });
      return;
    }

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
      { signal: controller.signal, fallbackUrls: alternatives },
    )
      .then((result) => {
        if (cancelled) {
          URL.revokeObjectURL(result.objectUrl);
          return;
        }
        objectUrl = result.objectUrl;
        setState({ src: result.objectUrl, mime: result.mime, error: false });
      })
      .catch(() => {
        if (!cancelled) setState({ error: true });
      });

    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, algorithm, key, nonce, hash, declaredMime, fallbacks, unsupported, alternatives]);

  if (!encryption) {
    return { src: url, mime: undefined, encrypted: false, loading: false, error: false, unsupported: false };
  }

  return {
    src: state.src,
    mime: state.mime ?? declaredMime,
    encrypted: true,
    loading: !state.src && !state.error,
    error: state.error,
    unsupported,
  };
}
