/**
 * Produce a URL whose origin is guaranteed to be the same as the base URL.
 * The path is either an absolute path (starting with `/`), or a full URL. In either case, only its path is used.
 */
export function mergeURLPath(
  /** Base URL. Result is guaranteed to use this URL's origin. */
  base: string,
  /** Either an absolute path (starting with `/`), or a full URL. If a full URL, its path */
  path: string,
): string {
  const url = new URL(
    path.startsWith('/') ? path : new URL(path).pathname,
    base,
  );

  if (!path.startsWith('/')) {
    // Copy query parameters from the original URL to the new URL
    const originalUrl = new URL(path);
    url.search = originalUrl.search;
  }

  return url.toString();
}
