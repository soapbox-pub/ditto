/**
 * Wikimedia's REST API returns both a small `thumbnail` and a large
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
 * Widths Wikimedia will render (`$wgThumbnailSteps`), ascending.
 *
 * Hotlinked requests for any other width are rejected outright with a 400 and
 * the body "Use thumbnail sizes listed on https://w.wiki/GHai", so a request
 * has to be snapped to one of these. Wikimedia keeps thumbnails forever, hence
 * the small fixed set — every distinct width is storage nobody reclaims.
 *
 * @see https://www.mediawiki.org/wiki/Common_thumbnail_sizes
 */
const THUMBNAIL_STEPS = [20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840];

/**
 * Picks the width to actually request: the smallest step that still covers
 * `targetWidth`, never exceeding the source file. Returns `undefined` when the
 * file is smaller than the smallest step, which leaves the caller no size worth
 * asking for.
 */
function chooseStep(targetWidth: number, originalWidth?: number): number | undefined {
  // Asking for more pixels than the file has makes Wikimedia upscale, which it
  // declines to do for some formats.
  const available = originalWidth
    ? THUMBNAIL_STEPS.filter((step) => step <= originalWidth)
    : THUMBNAIL_STEPS;

  if (!available.length) return undefined;

  return available.find((step) => step >= targetWidth) ?? available[available.length - 1];
}

/**
 * Rewrites a Wikimedia thumbnail URL to request a rendered width near
 * `targetWidth`, rounded up to the nearest size Wikimedia will serve.
 *
 * Thumbnail URLs look like
 * `https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Foo.jpg/330px-Foo.jpg`,
 * where the trailing `330px-` segment is the rendered width. Swapping that
 * number asks Wikimedia's thumbnailer for a different size.
 *
 * Pass `thumbnail.source` here, never `originalimage.source` — the latter is
 * whatever size the API decided to point at (currently 3840px, previously the
 * raw upload), which is exactly what we're trying to avoid downloading.
 *
 * Returns the input unchanged for non-Wikimedia hosts and for URLs that aren't
 * thumbnails, so it is safe to call on any candidate image URL.
 *
 * @param source Thumbnail URL from the Wikimedia REST API.
 * @param targetWidth Width we intend to render at, in CSS pixels.
 * @param originalWidth Width of the source file, when known.
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

  const width = chooseStep(targetWidth, originalWidth);

  // Leave the URL alone rather than build one Wikimedia would reject. The API
  // gave us this size, so it is one that renders.
  if (width === undefined) return source;

  segments[segments.length - 1] = `${width}px-${match[2]}`;
  url.pathname = segments.join('/');

  return url.toString();
}
