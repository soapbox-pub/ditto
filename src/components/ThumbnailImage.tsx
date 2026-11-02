import type { ImgHTMLAttributes } from 'react';

import { useImageThumbnail } from '@/hooks/useImageThumbnail';

/**
 * An `<img>` for a picture drawn well under 128px, such as a theme swatch.
 * Paints a downscaled copy (see `useImageThumbnail`) rather than decoding the
 * full-size original.
 */
export function ThumbnailImage({ src, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const thumbnail = useImageThumbnail(src);
  return <img {...props} ref={thumbnail.ref} src={thumbnail.src} />;
}
