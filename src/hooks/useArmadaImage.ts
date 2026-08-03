import { useEffect, useState } from 'react';
import { decryptArmadaImage } from '@/lib/armadaImage';
import type { ArmadaImagePointer } from '@/lib/armadaInvite';

/**
 * Fetch + decrypt an encrypted community image pointer to an object URL for
 * display. Returns `null` until it resolves (or if it can't be decrypted).
 * Revokes the object URL on unmount / pointer change to avoid leaks.
 */
export function useArmadaImage(pointer: ArmadaImagePointer | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!pointer) {
      setUrl(null);
      return;
    }
    let objectUrl: string | undefined;
    let cancelled = false;
    const controller = new AbortController();

    decryptArmadaImage(pointer, controller.signal).then((result) => {
      if (cancelled) {
        if (result) URL.revokeObjectURL(result);
        return;
      }
      objectUrl = result;
      setUrl(result ?? null);
    });

    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pointer]);

  return url;
}
