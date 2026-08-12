/**
 * Wikimedia's REST API returns both a small `thumbnail` and the full-resolution
 * `originalimage` for an article. Originals are routinely enormous: a featured
 * article froze the main thread for 1.2s decoding a 13737x7738 JPEG that was
 * displayed at 268x389. Ditto has no image-resizing proxy, so instead of
 * reaching for the original we ask Wikimedia for the width we actually render.
 */

/** Host that serves Wikimedia file thumbnails. */
const UPLOAD_HOST = 'upload.wikimedia.org';

/** Matches the `<width>px-<filename>` segment of a Wikimedia thumbnail URL. */
const THUMB_SEGMENT = /^(\d+)px-(.+)$/;

/**
 * Rewrites a Wikimedia thumbnail URL to request a specific width.
 *
 * Thumbnail URLs look like
 * `https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Foo.jpg/320px-Foo.jpg`,
 * where the trailing `320px-` segment is the rendered width. Swapping that
 * number asks Wikimedia's thumbnailer for a different size.
 *
 * Pass `thumbnail.source` here, never `originalimage.source` — originals are
 * served straight out of `/commons/` with no `/thumb/` path and cannot be
 * resized.
 *
 * Returns the input unchanged for non-Wikimedia hosts and for URLs that aren't
 * thumbnails, so it is safe to call on any candidate image URL.
 *
 * @param source Thumbnail URL from the Wikimedia REST API.
 * @param targetWidth Width to request, in CSS pixels.
 * @param originalWidth Width of the source file, when known. Wikimedia refuses
 * to upscale some file types, so the request is clamped to it.
 */
export function wikimediaImageUrl(
  source: string | undefined,
  targetWidth: number,
  originalWidth?: number,
): string | undefined {
  if (!source) return undefined;

  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return source;
  }

  if (url.hostname !== UPLOAD_HOST) return source;

  const segments = url.pathname.split('/');
  const filename = segments[segments.length - 1];
  const match = THUMB_SEGMENT.exec(filename);

  // An original-file URL rather than a thumbnail — nothing we can resize.
  if (!match) return source;

  const width = Math.round(
    originalWidth ? Math.min(targetWidth, originalWidth) : targetWidth,
  );

  segments[segments.length - 1] = `${width}px-${match[2]}`;
  url.pathname = segments.join('/');

  return url.toString();
}
