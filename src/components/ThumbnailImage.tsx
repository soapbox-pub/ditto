import type { ImgHTMLAttributes } from 'react';

import { useImageThumbnail } from '@/hooks/useImageThumbnail';

/**
 * An `<img>` for a picture drawn well under 128px, such as a theme swatch.
 * Paints a downscaled copy (see `useImageThumbnail`) rather than decoding the
 * full-size original.
 */
export function ThumbnailImage({ src, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const thumbnail = useImageThumbnail(src);
  if (!src) return null;
  // Hold the spot with an empty span while the thumbnail is pending: Firefox
  // and WebKit draw an img without a src as a broken image.
  if (!thumbnail.src) {
    return <span ref={thumbnail.ref} aria-hidden="true" className={props.className} style={props.style} />;
  }
  return <img {...props} src={thumbnail.src} />;
}
