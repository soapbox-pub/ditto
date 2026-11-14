import { useEffect, useMemo, useRef, useState } from 'react';

import { HeldImage, useMediaGate } from '@/components/MediaGate';
import { useBlossomFallback } from '@/hooks/useBlossomFallback';
import { decodeBlurhash, isValidBlurhash } from '@/lib/blurhash';
import type { ImetaEntry } from '@/lib/imeta';
import { EASE_EMPHASIZED, prefersReducedMotion } from '@/lib/motion';

/** Parses a NIP-94 `dim` string like "1280x720" into `{ width, height }`. */
function parseDim(dim: string | undefined): { width: number; height: number } | undefined {
  if (!dim) return undefined;
  const [w, h] = dim.split('x').map(Number);
  if (!w || !h || isNaN(w) || isNaN(h)) return undefined;
  return { width: w, height: h };
}

interface ImetaImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** An already-sanitized image URL. */
  src: string;
  /** NIP-92 metadata for `src`, if the event declared any. */
  imeta?: ImetaEntry;
}

/**
 * An `<img>` that uses its imeta to load gracefully: `dim` becomes the
 * width/height attributes so the browser reserves the right box before a byte
 * arrives, and `blurhash` paints that box until the image decodes. Falls back
 * across Blossom mirrors like the rest of the app's media, and renders nothing
 * once every source has failed.
 *
 * It stays a bare `<img>`, so typography (`prose-img`) and caller classes
 * style it exactly as before. Held behind the surrounding post's MediaGate.
 */
export function ImetaImage({ src, imeta, style, onLoad, onError, ...rest }: ImetaImageProps) {
  const gated = useMediaGate().active;
  const fallback = useBlossomFallback(src, imeta?.fallbacks);
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  const dimensions = parseDim(imeta?.dim);
  const placeholder = useMemo(
    () => (isValidBlurhash(imeta?.blurhash) ? decodeBlurhash(imeta.blurhash) : undefined),
    [imeta?.blurhash],
  );

  // A cached image may finish before React attaches onLoad. It's there at
  // once, so it doesn't animate in either.
  const arrivedCached = useRef(false);
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      arrivedCached.current = true;
      setLoaded(true);
    }
  }, [fallback.src]);

  if (gated) {
    return (
      <HeldImage
        className={rest.className}
        style={{ ...(dimensions && { aspectRatio: `${dimensions.width} / ${dimensions.height}` }), ...style }}
      />
    );
  }

  if (fallback.failed) return null;

  return (
    <img
      loading="lazy"
      decoding="async"
      {...rest}
      ref={imgRef}
      src={fallback.src}
      width={dimensions?.width}
      height={dimensions?.height}
      style={{
        ...(dimensions && { aspectRatio: `${dimensions.width} / ${dimensions.height}` }),
        // Dropped once loaded so it can't show through transparent pixels.
        ...(placeholder && !loaded && {
          backgroundImage: `url(${placeholder})`,
          backgroundSize: '100% 100%',
        }),
        ...style,
      }}
      onLoad={(e) => {
        setLoaded(true);
        // The blurhash resolves into the picture; with none, it fades in.
        if (!arrivedCached.current && !prefersReducedMotion()) {
          e.currentTarget.animate?.(
            placeholder ? [{ filter: 'blur(12px)' }, { filter: 'blur(0)' }] : [{ opacity: 0 }, { opacity: 1 }],
            { duration: 350, easing: EASE_EMPHASIZED },
          );
        }
        onLoad?.(e);
      }}
      onError={(e) => {
        fallback.onError();
        onError?.(e);
      }}
    />
  );
}
