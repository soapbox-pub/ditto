import type { ImgHTMLAttributes, ReactNode } from 'react';

import { useProfileImageSource } from '@/hooks/useProfileImageSource';
import type { ImetaEntry } from '@/lib/imeta';

interface FallbackImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> {
  /** The image URL. Nothing renders without one. */
  src: string | undefined;
  /**
   * imeta describing `src` — a kind 0's `author.data?.imeta?.banner`, say.
   * Adds its declared fallbacks to the walk and decrypts an encrypted image.
   * Ignored unless its `url` is `src`.
   */
  imeta?: ImetaEntry;
  /** Rendered once every source has failed (or there is no `src`). Defaults to nothing. */
  fallback?: ReactNode;
  /** Rendered while an encrypted image decrypts. Defaults to `fallback`. */
  placeholder?: ReactNode;
}

/**
 * An `<img>` that walks the same content-addressed blob across the viewer's
 * other Blossom servers before giving up (see `useBlossomFallback`), then shows
 * `fallback` instead of a broken-image icon.
 *
 * For the images that are not feed media — profile banners, badge art, emoji
 * pack and community icons — which were plain `<img>` elements, each one blank
 * the moment the single server named in its URL went down.
 */
export function FallbackImage({ src, imeta, fallback = null, placeholder, alt, ...props }: FallbackImageProps) {
  const source = useProfileImageSource(src, imeta);
  if (source.pending) return <>{placeholder ?? fallback}</>;
  if (!source.src || source.failed) return <>{fallback}</>;
  return <img {...props} src={source.src} alt={alt ?? source.imeta?.alt ?? ''} onError={source.onError} />;
}
