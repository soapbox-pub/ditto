import type { ImgHTMLAttributes, ReactNode } from 'react';

import { useBlossomFallback } from '@/hooks/useBlossomFallback';

interface FallbackImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> {
  /** The image URL. Nothing renders without one. */
  src: string | undefined;
  /** Rendered once every source has failed (or there is no `src`). Defaults to nothing. */
  fallback?: ReactNode;
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
export function FallbackImage({ src, fallback = null, alt = '', ...props }: FallbackImageProps) {
  const walk = useBlossomFallback(src);
  if (!walk.src || walk.failed) return <>{fallback}</>;
  return <img {...props} src={walk.src} alt={alt} onError={walk.onError} />;
}
