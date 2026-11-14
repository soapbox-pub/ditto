import type { ImgHTMLAttributes, ReactNode } from 'react';

import { HeldImage, useMediaGate } from '@/components/MediaGate';
import { useProfileImageSource } from '@/hooks/useProfileImageSource';
import { markIfAlreadyLoaded, markImageLoaded } from '@/lib/fadeOnLoad';
import type { ImetaEntry } from '@/lib/imeta';
import { cn } from '@/lib/utils';

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
  /**
   * Hold the image behind the surrounding post's MediaGate. Opt-in, because
   * this also renders non-post images (hover cards, profile pages) that can
   * sit inside a post's gate without belonging to its author.
   */
  gated?: boolean;
  /** Fade the image in as it loads, over whatever sits behind it. */
  fadeIn?: boolean;
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
export function FallbackImage({ src, imeta, fallback = null, placeholder, gated, fadeIn, alt, ...props }: FallbackImageProps) {
  const held = useMediaGate().active && gated;
  const source = useProfileImageSource(held ? undefined : src, held ? undefined : imeta);
  if (held) return src ? <HeldImage className={props.className} style={props.style} /> : <>{fallback}</>;
  if (source.pending) return <>{placeholder ?? fallback}</>;
  if (!source.src || source.failed) return <>{fallback}</>;
  if (!fadeIn) return <img {...props} src={source.src} alt={alt ?? source.imeta?.alt ?? ''} onError={source.onError} />;
  return (
    <img
      {...props}
      ref={markIfAlreadyLoaded}
      src={source.src}
      alt={alt ?? source.imeta?.alt ?? ''}
      className={cn('fade-on-load', props.className)}
      onLoad={(e) => {
        markImageLoaded(e.currentTarget);
        props.onLoad?.(e);
      }}
      onError={(e) => {
        markImageLoaded(e.currentTarget);
        source.onError();
      }}
    />
  );
}
